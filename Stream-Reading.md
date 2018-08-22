# Stream Reading
### Abstract
1. Stream reading 的重要性
2. Stream reading 的具体使用场景

### Stream Reading 的重要性
Stream reading 的具体含义是流式（使用恒定内存）地读取（处理）很大的数据，数据的来源可以是很多种形式：磁盘文件、网络包等。

先抛开 Stream，我们看一下 Reading，在 golang 中读取（Reading）这个行为被很好的抽象了出来：
```
type Reader interface {
	Read([]byte) (int, error)
}
```

Reader 行为很简单，从源数据中读取相关的内容到 caller 提供的数组中，注意最终读取的长度不一定是数组的长度，返回的实际长度以第一个返回值给出。并且对于返回值的 error，需要特别注意 `EOF` 这个错误，因为当发生这个错误的时候，仍然有很大可能有不少数据还是读出来了，这部分数据也是需要处理的，因此 Reader 的使用方式一般会有这样的写法：
```go
p := make([]byte, 32 * 1024)
for {
	n, err := reader.Read(p)
  if err != nil && err != io.EOF {
  		processError(err)
      break
   }
  processData(p[:n])
  if err == io.EOF {
  		break
	}
}
```

Stream Reading 的优势主要有两点：
1. 源数据很大，无法全部读到内存中进行处理
2. 对于处理好的结果可以先反馈给接收方，减小 latency

对于第二点有一个重要的前提就是，处理的数据必须支持流式处理，也就是说前面的数据不受后面的数据影响（不过即使受影响也是可以通过记录一些状态来帮助处理，但是这样就无法保证占用内存恒定）。

比如我需要处理一段文本数据，需要不断的解析文本中的数据（比如随着时间变化的某个量），format 之后传输给 web 端展示，那么如果数据量特别大的话（超过100MB），那么多几个请求，服务器可能就因为内存不足而 Crash 了。除此之外，如果是逐行处理的话，数据只要超过 10 MB，就可能导致 web 端因为接口的结果迟迟不能返回，处于很长时间的 loading，严重影响用户体验。但是如果采用 stream reading 的方式做，我们只需要对于每一个请求维护一个较小的 buffer 即可（比如 32 KB），然后每次都处理这么 32KB 左右的数据，再将处理好的结果返回给 web 端，web 端的 latency 将只会有 32KB 的处理延迟，而不是之前几百兆的延迟。

### Stream Reading 的具体使用场景
写这篇文章的起因其实就是我工作中遇到的一个问题：
web 端需要提供某种文件的下载，但是文件中有一些敏感字符串，需要将这些敏感字符串所在的行去除掉之后，进行压缩然后传输给 web 端，整个 pipeline 如下：
```
读取文件 ——————> 去除敏感行 ————————> 压缩传输
```

最愚蠢的方式是，第一步把文件的内容全部读到内存中，第二步是内存中的字符串逐行进行处理，再将去除了敏感行的数据压缩完毕后，传输给 web 端下载。

显然一点压缩传输是可以 stream 的，这一点也是我一开始的使用方式，但是没想到当文件超过 2 MB 之后，就会出现明显的 latency。然而读取文件和去除敏感行，以及去除敏感行和压缩传输都是完完全全地分两步进行的（全部读到内存中处理完，在进行下一步），而这实际上是可以进行流式处理的。

将整个 pipeline 变得流水化，也就达到了 Stream Reading 的效果了，而流水化的关键其实就是将每个读数据的行为抽象成一个 `Reader`，然后形成一个 `Reader` 的依赖链（表现形式是对`Reader` 封装形成下一个 `Reader`) ，于是我们只要对最终的一个 `Reader` 不停地调用 `Read` 即可完成 stream reading。

以下我们可以来进行整个处理流程，笔者使用的环境是：
```
1. macOS high sierra
2. go 1.10.3 darwin/amd64
```

#### 读取文件
```
func fileReader(sFile string) (io.ReadCloser, error) {
    f, err := os.Open(sFile)
    if err != nil {
        return nil, err
    }
    return f, nil
}
```

我们提供的生成一个 reader，接下来继续对这个 reader 进行封装，就可以逐步实现 stream reading（说到底 stream reading 是基于 reader 的一层一层的封装，每次封装会加入新的逻辑，并保持 `Read` 这一行为不变）。

#### 过滤敏感行
比起读取文件，去除敏感行的话，就比较麻烦了。

因为是笔者实际工程中遇到的问题，所以需要说的清楚一些：
去除敏感行，意味着必须一行一行的去除，如果给出一块字符，就会出现最后结尾的一段不是完整的一行（这段数据没有以换行符结尾），对于这种 broken line 是无法判断其是否是敏感行的，所以我们在做 filter 的时候逐行处理到最后一行时直接不处理这一 broken line（如果没有遇到换行符），因此 filterFunc 这个函数的 signature 如下：
```go
type filterFunc func([]byte)([]byte, []byte)
```

一共出现 3 个 []byte，含义分别作如下解释：
1. source data：可能含有敏感行，并且最后一行可能是 broken line
2. broken line：我们选择直接返回给 caller 处理（一般是缓存下来）
3. filtered lines：被过滤过的安全的字符串

具体的这个 filterFunc 实现在这篇博客中不是关键的东西，因此就省略了这个func 的实现。

下面直接给出 filterReader 的实现：
```go
type filterReader struct {
  // ll means last line
	ll	   	   []byte
	rc         io.ReadCloser
  filterF    filterFunc
}

func (r *filterReader) Read(p []byte) (readN int, err error) {
	// the dropped bytes of last time has been saved in buffer
	if len(r.ll) >= len(p) {
		log.Warn("broken line exceeds the read length")
		r.ll = nil
	}

	buffer := make([]byte, len(p))
	var n int
	n, err = r.rc.Read(buffer[len(r.ll):])
	if err != nil && err != io.EOF {
		return
	}
	copy(bs, r.ll)
	buffer = buffer[:len(r.ll)+n]

	line, bs := r.filterF(buffer)
	copy(p, bs)
	r.ll = line
	readN = len(bs)
	return
}

func (r *filterReader) Close() error {
	return r.rc.Close()
}
```

这里最主要的实现就是 Read 函数，可以发现，filterReader 的多了一个 `ll` 的 []byte，这个其实是用来存储 broken line 的内容，我们将其存储下来用于下一次过滤。

除此之外还有一个错误处理其实没做好，就是当 broken line 超过了一次的 Read buffer，其实需要更仔细的处理，但是放在这篇 blog 中，就先简单处理一下，当出现这种情况只是打一个 log，然后直接丢弃上次的 broken line。

我们再提供一个方法方便构造 FilterReader：
```golang
func newFilterReader(fReader io.ReadCloser, filterF filterFunc) (io.ReadCloser, error) {
   return &filterReader{
       rc: fReader,
       filterF: filterFunc
   }
}
```

#### 流式压缩
到了压缩这一部分，就可以使用我们写好的 `Reader` 了。
一般来说压缩可以抽象成一个 `pipe`， 输入是一个 `Writer`，输出是一个 `Reader`，所以有了 FilterReader 的接口，利用 `io.Copy(writer, reader) `我们就非常容易地进行压缩的输入，然后再从 `pipe` 的 `Reader` 中不停地读取数据，提供给 web 端。

**稍后添加上代码**
