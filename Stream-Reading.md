# Stream Reading
### Abstract
本文主要阐述一下两点内容：
* Stream Reading 的重要性
* Stream Reading 的具体使用场景

本文虽然是以 golang 作为举例的编程语言，但是其思想适用于任何一个编程语言。

### Stream Reading 的重要性
Stream Reading 的具体含义是流式（使用恒定内存）地读取（处理）很大的数据，而数据的来源可以是很多种形式：磁盘文件、网络包等。

先抛开 Stream，我们看一下 Read 这一行为本身在 golang 中是如何定义的：
```golang
type Reader interface {
	Read([]byte) (int, error)
}
```

Reader 行为很简单：从源数据中读取相关的内容到 caller 提供的数组中。
但是注意最终读取的长度不一定是数组的长度，返回的实际长度以第一个返回值给出。这里需要强调一下，对于返回值的 error，需要特别注意 `EOF` 这个错误，因为当发生这个错误的时候，仍然有可能会有部分数据还是读出来存储到了给定的 buffer 中，这部分数据也是需要 caller 自己去处理的，因此 Reader 的一般会有这样的写法：
```golang
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
1. 无论源数据有多大，都能使用恒定内存去做处理
2. 对于处理好的结果可以先反馈给接收方，减小 latency

对于第二点有一个重要的前提就是，处理的数据必须支持流式处理，也就是说前面的数据不受后面的数据影响（不过即使受影响也是可以通过记录一些状态来帮助处理，但是这样就无法保证占用内存恒定）。

先举一个简单的例子来说明上述两点，具体的例子会在本文的第二部分详细阐述：比如需要处理一段文本数据，要求不断地解析文本中的数据（比如随着时间变化的某个量），format 之后传输给 web 端展示。此时如果数据量特别大的话（超过100MB），那么 web 端多发几个请求，服务器可能就因为内存不足而 crash 了。除此之外，如果是逐行处理的话，数据只要超过 10 MB，就可能导致 web 端因为接口的结果迟迟不能返回，处于很长时间的 loading，严重影响用户体验。
如果采用 stream reading 的方式做，我们将只需要对于每一个请求维护一个较小的 buffer 即可（比如 32 KB），然后每次都处理 32KB 左右的数据，再将处理好的结果返回给 web 端，那么 web 端的 latency 将只会有 32KB 的处理延迟，而不是之前几百兆的延迟，并且服务器的负载也大大减小。

### Stream Reading 的具体使用场景
写这篇文章的起因其实就是我工作中遇到的一个问题：
web 端需要提供某种文件的下载，但是文件中有一些敏感字符串，需要将这些敏感字符串所在的行去除掉之后，进行压缩然后传输给 web 端，整个 pipeline 如下：
```
读取文件 ——————> 去除敏感行 ————————> 压缩传输
```

最愚蠢的方式是，第一步把文件的内容全部读到内存中，第二步是内存中的字符串逐行进行处理，再将去除了敏感行的数据压缩完毕后，传输给 web 端下载。

显然一点压缩传输是可以 stream 的，这一点也是我一开始的使用方式，但是没想到当文件超过 2 MB 之后，就会出现明显的 latency。然而读取文件和去除敏感行，以及去除敏感行和压缩传输都是完完全全地分两步进行的（全部读到内存中处理完，在进行下一步），而这实际上是可以进行流式处理的。

将整个 pipeline 变得流水化，也就达到了 Stream Reading 的效果了，而流水化的关键其实就是使用一个大小适中的 buffer，buffer 会从数据源处获取数据，然后在 pipeline 中不断被处理，直至结束。

而在 golang 中，通过 Reader 这个 Interface 我们可以加这个行为描述的更清晰一点：就是将每个读数据的行为抽象成一个 `Reader`，从而构成一个 `Reader` 的依赖链（表现形式是讲 `Reader` 封装形成一个新的 `Reader`) ，于是我们只要对最终的一个 `Reader` 不停地调用 `Read` 即可完成 Stream Reading。

以下我们可以来进行整个处理流程，笔者使用的环境是：
```
1. macOS high sierra
2. go 1.10.3 darwin/amd64
```

#### 读取文件
```golang
func fileReader(sFile string) (io.ReadCloser, error) {
    f, err := os.Open(sFile)
    if err != nil {
        return nil, err
    }
    return f, nil
}
```

我们提供的生成一个 Reader，接下来继续对这个 Reader 进行封装，就可以逐步实现 Stream Reading（说到底在 golang 中 Stream Reading 是对 Reader 的一层一层封装，每次封装会加入新的逻辑，并保持 `Read` 这一行为不变）。

#### 过滤敏感行
比起读取文件，去除敏感行的话，就比较麻烦了。

假设我们提供了一个 FilterFunc，其函数签名如下：
```golang
type FilterFunc func(string) bool
```

返回 `true` 意味着保留这一行，返回 `false` 意味着需要过滤这一行。

那么接下来我们需要做的事情就是在 `File` 这个 Reader 上面再次进行封装，从而提供一个 FilterReder，其效果就是一行一行地处理从 `File` 中读取到的内容，判断其是否为敏感行，如果是则跳过，否则保留。

但是因为是笔者实际工程中遇到的问题，所以除了这个简单的过滤之外，还有一个细节需要说的清楚一些：
去除敏感行，其实意味着是一行一行地去除，因此如果给出一块字符，就会出现这样的情况——最后结尾的一段不是完整的一行（这段数据没有以换行符结尾），笔者称之为 Broken Line。对于这种 Broken Line  我们是无法判断其是否为敏感行的，因此在做 filter 逐行处理到最后一行时，我们选择先不处理 Broken Line，而是将其缓存下来待到下一次处理的时候，这个缓存的 Broken Line 和之后的字符串拼接，从而形成完整的一行。

下面给出 filterReader 的实现：
```golang
type lineFilterReader struct {
  // bl is the buffer line
  bl         string
  s          *bufio.Scanner
  filterLine FilterFunc
  eof        error
}

func (fr *lineFilterReader) Read(p []byte) (n int, err error) {
  if fr.eof != nil {
    return 0, io.EOF
  }

  scanDone := false
  s := fr.s
  for {
    if len(fr.bl) >= len(p) {
      break
    }
    if !s.Scan() {
      scanDone = true
      break
    }
    if fr.filterLine(s.Text()) {
      fr.bl = strings.Join([]string{fr.bl, s.Text() + "\n"}, "")
    }
  }

  if scanDone {
    if err := s.Err(); err != nil {
      return 0, err
    }
    fr.eof = io.EOF
  }

  copiedN := copy(p, fr.bl)
  fr.bl = fr.bl[copiedN:]

  return copiedN, fr.eof
}

// NewLineFilterReader build a line filter reader
func NewLineFilterReader(r io.Reader, filterLine FilterFunc) io.Reader {
  return &lineFilterReader{
    s:          bufio.NewScanner(r),
    filterLine: filterLine,
  }
}
```

这里我们使用 `bufio.Scanner` 来进行优雅地行遍历，至此我们的 Reader 已经具备了 filter 功能。

#### 流式压缩
现在到了压缩这一部分，就可以使用我们写好的 filterReader 了。

一般来说在 golang 中，可以将压缩可以抽象成一个 `pipe`， 输入是一个 `Writer`，输出是一个 `Reader`，所以有了 filterReader，利用 `io.Copy(writer, reader) `我们就非常容易地进行压缩的输入，然后再从 `pipe` 的 `Reader` 中不停地读取数据，提供给 web 端。

代码如下：
```golang
	pr, pw := io.Pipe()
	zipW := zip.NewWriter(pw)
	zipF, _ := zipW.Create("123.txt")
	go func() {
		io.Copy(zipF, filterR)
		zipW.Close()
		pw.Close()
	}()

	// zipFile is used to simulate the receiver
	// it may be a http body in prod
	zipFileName := "stream_reading.zip"
	zipFile, _ := os.Create(zipFileName)
	defer os.Remove(zipFileName)
	io.Copy(zipFile, pr)
	zipFile.Close()
```

这里的代码中有几点需要说明一下：
1. `filterR` 是一个 filterReader
2. 这里我们将压缩的结果 copy 到 `zipFile`，只是为了演示使用，实际上在实际应用中，这里可以是一个 http body

到这里，我们的 pipeline 最终建立了起来：
```
读取文件 ——————> 去除敏感行 ————————> 压缩传输
```

完整的 demo 代码可以看：[ShiKaiWi.github.io/stream_reading.go at master · ShiKaiWi/ShiKaiWi.github.io · GitHub](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/src/stream_reading.go)