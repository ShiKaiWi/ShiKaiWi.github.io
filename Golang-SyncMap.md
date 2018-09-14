# Golang SyncMap

## 概要
golang 的 map 本身不是 thread-safe 的，但是通过使用读写锁，我们可以构造出一个 thread-safe 的 syncmap，不过这样写出的性能并不是不是很令人满意（[go-syncmap-benchmark](https://medium.com/@deckarep/the-new-kid-in-town-gos-sync-map-de24a6bf7c2c))，在某些场景（高并发+新增不频繁）下，我们需要更高效的 syncmap。

因此 golang 官方提供了一个高效的 [syncmap](https://github.com/golang/sync/blob/master/syncmap/map.go)（下面 syncmap 就是指这一实现），本篇文章会分析其源码，看看 syncmap 是如何做到更高效的。

## 直觉
本篇文章的最主要的目的是探究出为什么 syncmap  能够提供高效的并发效率。在具体阐述之前，有一个直觉可以先建立起来——就是说用最简单的词来描述这个原因——**lock free**。

## 代码
### 数据结构
因为想要借助 lock free 来提高访问效率，那么势必需要增加一些辅助的数据结构来支持 lock free 操作。
在 syncmap 中实际存在两个 built-in 的 map：read  map & dirty map。
可以看一下代码中的表示:
```go
type Map struct {
	mu sync.Mutex
	read atomic.Value // readOnly
	dirty map[interface{}]*entry
	misses int
}

type readOnly struct {
	m       map[interface{}]*entry
	amended bool // true if the dirty map contains some key not in m.
}
```

从代码中可以发现，read map 和 dirty map 的存储方式是不一致的——前者使用 atomic.Value，后者只是单纯的使用 map。其实，这样的原因是 read map 是一个给 lock free 操作使用的数据结构，必须保证 load/store 的原子性，而 dirty map 的 load+store 操作是由 lock （就是 `mu`）来保护的。

那么 read map 和 dirty map 里面究竟存的是什么呢？

在介绍这个之前，我们先得看一下，这里的 syncmap 中管理的一条条 `entry` 的结构：
```go
type entry struct {
	p unsafe.Pointer // *interface{}
}
```

这里的 `entry` 其实就是正常 map 中的 value，但是为什么这里使用一个 `entry` 结构来做一层 wrapper 呢？

其实，这是因为在对某个 key 做删除的时候，会由于 built-in 的 map 不是 thread-safe 的，所以无法达到 lock free ，然而通过这个 `entry` 我们可以添加一些状态来回避这个问题，从注释中可以看到 entry 有两个状态：
* `nil`
* `expunged`

其中 `nil` 表示 deleted（从而解决了上面所述的删除问题，我们不需要执行 non-thread-safe 的 `delete(m, key)` 操作），那么 `expunged` 又是代表什么状态呢？

这就要回到一开始提到的问题：
> read map 和 dirty map 里面究竟存的是什么呢？  

![](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/go-syncmap/read_dirty_map.svg)

从上图中可以看出，read map 和 dirty map 中含有相同的一部分 `entry`，我们称作是 normal entries，是双方共享的，并且满足：其中的 `entry.p` 只会是两种状态，
* `nil`
* `unexpunged`

但是 read map 中含有一部分 `entry` 是不属于 dirty map 的，而这部分 `entry` 就是状态为 `expunged` 状态的 `entry`。

而 dirty map 中有一部分 `entry` 也是不属于 read map 的，而这部分其实是来自 `Store` 操作形成的（也就是新增的 `entry`），换句话说就是新增的 `entry` 是出现在 dirty map 中的。

现在知道了 read map 和 dirty map 的是什么了，那么还得理解一个重要的问题是：
read map 和 dirty map 是用来干什么的，以及为什么这么设计？

 第一个问题的答案的具体细节会在下面的代码流程的分析中进行详细的阐述，但这里可以给出一个简略的答案：read map 是用来进行 lock free 操作的（其实可以读写，但是不能做删除操作，因为一旦做了删除操作，就不是线程安全的了，也就无法 lock free），而 dirty map 是用来在无法进行 lock free 操作的情况下，需要 lock 来做一些更新工作的对象。

至于为什么设计成这样，会在最后一节解释一下。

### 代码流程
#### Store
```go
func (m *Map) Store(key, value interface{}) {
	read, _ := m.read.Load().(readOnly)
	if e, ok := read.m[key]; ok && e.tryStore(&value) {
		return
	}

	m.mu.Lock()
	read, _ = m.read.Load().(readOnly)
	if e, ok := read.m[key]; ok {
		if e.unexpungeLocked() {
			m.dirty[key] = e
		}
		e.storeLocked(&value)
	} else if e, ok := m.dirty[key]; ok {
		e.storeLocked(&value)
	} else {
		if !read.amended {
			m.dirtyLocked()
			m.read.Store(readOnly{m: read.m, amended: true})
		}
		m.dirty[key] = newEntry(value)
	}
	m.mu.Unlock()
}
```

删除注释的话，整段 `Store` 的代码不长，整体思路就是：
1. 如果从 read map 中能够找到 normal entry 的话，那么就直接 update 这个 entry 就行（lock free）
2. 否则，就上锁，对 dirty map 进行相关操作

代码中的 `tryStore` 会在 `entry` 是 `expunged` 的情况下失败，从而进入 slow path，也就是说进入上锁的流程。

上锁之后，需要重新 check 一下 read map 中的内容（这一点是 lockless 里面的一种常见的 pattern），如果发现仍然是 `expunged` 的，那么会将 `expunged` 标记为 `nil`，并且在 dirty map 里面添加相应 key（这里其实就是将这个 `entry` 从一个 `expunged` 的	`entry` 变成了 normal entry）。

将 `expunged` 标记为 nil：
```go
func (e *entry) unexpungeLocked() (wasExpunged bool) {
	return atomic.CompareAndSwapPointer(&e.p, expunged, nil)
}
```

如果发现这个 key 并不属于 read，但属于 dirty 的时候，直接更新相应的值即可。

最后一种情况较为复杂，就是当这个 key 既不存在于 read map 中也不存在于 dirty map 中，在这种情况下，我们需要同时修改 read 和 dirty：
如果 read map 没有被修改过（`read.ameded==false`），则意味着我们需要初始化 dirty map（read map 没有修改过表明 dirty map 有可能还未被使用，也就是说 dirty map 有可能是 `nil`），初始化的工作是通过 `dirtyLocked` 这个方法完成的：
```go
func (m *Map) dirtyLocked() {
	if m.dirty != nil {
		return
	}

	read, _ := m.read.Load().(readOnly)
	m.dirty = make(map[interface{}]*entry, len(read.m))
	for k, e := range read.m {
		if !e.tryExpungeLocked() {
			m.dirty[k] = e
		}
	}
}

func (e *entry) tryExpungeLocked() (isExpunged bool) {
	p := atomic.LoadPointer(&e.p)
	for p == nil {
		if atomic.CompareAndSwapPointer(&e.p, nil, expunged) {
			return true
		}
		p = atomic.LoadPointer(&e.p)
	}
	return p == expunged
}
```

这段代码主要就是根据 read map 来生成 dirty map，生成逻辑是忽略 read map 中状态是 `nil` 以及 `expunged` 的 `entry`（并在忽略的同时，将 `nil` 的 `entry` 设置为 `expunged`），将其他有效的 `entry` 纳入到 dirty map 中。

回到我们的 `Store` 方法，在新建了 dirty map 之后，需要将 read map 的 `amended` 置成 true，另外在最后我们需要将新加入的 key 放入 dirty 中。

至此更新完毕。

这段 `Store` 的代码还是比较清晰的，但是其中有个值得注意的地方，在我们调用 `tryExpungedLocked` 的时候，我们其实是持有着 mu 这个 lock 的，但是为什么仍然还是用了 CAS（CompareAndSwap 下同）的操作呢？
这个问题笔者会在最后一个 section 给出个人的看法。

#### Load
```go
func (m *Map) Load(key interface{}) (value interface{}, ok bool) {
	read, _ := m.read.Load().(readOnly)
	e, ok := read.m[key]
	if !ok && read.amended {
		m.mu.Lock()
		read, _ = m.read.Load().(readOnly)
		e, ok = read.m[key]
		if !ok && read.amended {
			e, ok = m.dirty[key]
			m.missLocked()
		}
		m.mu.Unlock()
	}
	if !ok {
		return nil, false
	}
	return e.load()
}
```

去除了注释的 `Load` 比起 `Store` 更加简短，首先返回值中包含了一个 bool 值 `ok`，其含义和 built-in 的 map 语义一致，都代表该 key 存不存在。

和 `Store` 一样，分为 fast 和 slow 两条 code path。

其中 fast path 依旧利用了支持 lock free 的 read map，但是如果发现这个 key 不存在于 read map 中的时候，我们就需要去 dirty  map 里面找了（从之前的图我们知道 dirty map 中是存在一部分新加入的、不在 read map 中的 key ）。

从 dirty map 中读取数据时我们依旧需要遵守上锁的原则，lock 了之后，我们依旧需要重新 check 一次 read 中的是否出现了该 key，如果存在，就会跳出当前的关键区（critical area），否则，我们需要从 dirty map 中取出该 `entry`，并且记录一次 `misslocked`，这里的 `msslocked` 方法定义如下：
```go
func (m *Map) missLocked() {
	m.misses++
	if m.misses < len(m.dirty) {
		return
	}
	m.read.Store(readOnly{m: m.dirty})
	m.dirty = nil
	m.misses = 0
}
```

这里的 `misses` 变量会进行自增，累积到一定数目之后，我们会将 dirty map 直接复制给 read map，并且将 dirty map 重置为 `nil`，这样之前一段时间新加入的 key 都会进入到 read 中，从而能够支持增加的  read map 的命中率。

最后使用我们筛选出来的 `entry`，调用 `entry.load` 方法：
```go
func (e *entry) load() (value interface{}, ok bool) {
	p := atomic.LoadPointer(&e.p)
	if p == nil || p == expunged {
		return nil, false
	}
	return *(*interface{})(p), true
}
```

此时我们只要利用好 atomic 操作就好了，对于 `nil` 和 `expunged` 状态的 `entry`，直接返回 `ok=false` 即可。

#### Delete
```go
func (m *Map) Delete(key interface{}) {
	read, _ := m.read.Load().(readOnly)
	e, ok := read.m[key]
	if !ok && read.amended {
		m.mu.Lock()
		read, _ = m.read.Load().(readOnly)
		e, ok = read.m[key]
		if !ok && read.amended {
			delete(m.dirty, key)
		}
		m.mu.Unlock()
	}
	if ok {
		e.delete()
	}
}
```

`Delete` 的操作流程几乎和 `Load` 一致，惟一的区别是对于只在 dirty map 中的 key（新加入到 map 中的 key 会被放到 dirty 中）我们需要进行一次 delete 操作，但是没关系，通过 lock 我们对于 dirty 的操作都是 thread-safe 的。

最后看一下 entry 的 delete 方法：
```go
func (e *entry) delete() (hadValue bool) {
	for {
		p := atomic.LoadPointer(&e.p)
		if p == nil || p == expunged {
			return false
		}
		if atomic.CompareAndSwapPointer(&e.p, p, nil) {
			return true
		}
	}
}
```

这里比较奇怪的是为什么需要一个 bool 的返回值，其他地方也确实没有使用到这个返回值，这一点笔者也不是很明白。

我们直接看最重要的一部分——将 `entry` 设置成 `nil` 状态。

这里有个问题是说，为什么将 `entry` 设置成 `nil` 而不是 `expunged`？

从第一张图中的可以看出，同时存在于 read map 和 dirty map 中的 `entry` 是 `unexpunged` 的，而执行 CAS 成功的条件表明该 `entry` 既不是 `nil` 也不是 `expunged` 的，那么就是说这个 `entry` 必定是存在于 dirty  map 中的，也就不能置成 `expunged`。

#### Load Store Delete
`Load Store Delete`  的操作都基本描述完了，可以用下面的一张图用来总结一下：
![](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/go-syncmap/load_store.svg)


### read map 和 dirty map 的设计分析
最核心和最基本的原因就是：
通过分离出 readonly 的部分，从而可以形成 lock free 的优化。

从上面的流程可以发现，对于 read map 中 `entry` 的操作是不需要 lock 的，但是为什么就能够保证这样的无锁操作是 thread-safe 的呢？

这是因为 read map 是 read-only 的，不过这里的 read-only 是指 entry 不会被删除，其实值是可以被更新，而值的更新是可以通过 CAS 操作保证 thread-safe 的，所以读者可以发现，即使在持有 lock 的时候，仍然需要 CAS 来对 read map 中的 `entry` 进行操作，此外对于 read map 本身的更新也是 通过 atomic 来操作的（在 `missLocked` 方法中）。

### syncmap 的缺陷
其实通过上面的分析，了解了整个流程的话，读者会很容易理解这个 syncmap 的缺点：当需要不停地新增和删除的时候，会导致 dirty map 不停地更新，甚至在 miss 过多之后，导致 dirty 成为 nil，并进入重建的过程。

###  关于 lock free 的启发
lock free 会给并发的性能带了较高的提升，目前通过 syncmap 的代码分析，我们也对 lock free 有一些了解，下面会记录一下笔者从 syncmap 中得到的对 lock free 的一些理解。

#### recheck in slow path when failed in fast path
我们发现，在 read map 中读取失败的时候，我们会有进入持有 lock 的关键区，这个时候，需要注意代码都不能依赖之前的 atomic read，这点虽然很简单，但是也是一种常见的 pattern 吧。

#### update based on read via CAS
从 syncmap 中，我们还很容易发现这样的代码：
```go
func (e *entry) tryExpungeLocked() (isExpunged bool) {
	p := atomic.LoadPointer(&e.p)
	for p == nil {
		if atomic.CompareAndSwapPointer(&e.p, nil, expunged) {
			return true
		}
		p = atomic.LoadPointer(&e.p)
	}
	return p == expunged
}
```

理论上这是使用 CAS 的一种常见操作，就是我们在做一次更新的时候，需要依据某次读操作，只有读操作满足了一定的条件我们才能完成我们的写操作，而 CAS 正是为了这样的 update 而存在的，也是 lock free（其实也包括 lock）实现的关键所在。

#### safe to check an ending state
其实从上面的这段例子代码，我们可以发现一点细节，为什么需要用 forloop 去不停地检查呢？如果不用 forloop 去做更新的话，代码时这样的：
```go
func (e *entry) tryExpungeLocked() (isExpunged bool) {
	if atomic.CompareAndSwapPointer(&e.p, nil, expunged) {
		return true
	}
	return atomic.LoadPointer(&e.p) == expunged
}
```

要说正确性的话，这样做是对的，那么使用 forloop 一定是为了做什么优化了。

仔细分析，可以发现，其实加上 forloop 是为了识别出这样一种情况：在 forloop 条件正确的情况下（`p==nil`）该 `entry` 被 update 了，从而 `p!=nil` 了，然后 CAS 之后又被 delete 了，那么这样的情况下，这个 nil 的 key 将会被存储到 dirty 中去。

但是其实这个 key 已经被删除了，可以不用转移到 dirty 中去了，所以加上 forloop 就能检查出上面提到的这种情况，达到一点点性能上的优化。

此外，还有一个细节问题，就是这里的最终返回结果是通过检查 p 是否是 `expunged` 的，但是理论上这样的读，在 lock free 下（比如 `Store` 里面的 fast path 可能是可以改变 p 的值的），是没有可信度的，但是代码中仍然相信这一点，这是为什么呢？

这正是这一小节要提的，这是因为 `expunged` 在**无锁的情况下**是一个最终状态，就是在无锁的状态机中无法转移到其他状态的状态，也就是说一旦检测到一个 key 已经处于了 `expunged` 的状态的话，那么他就不可能**在无锁的情况下**再次成为其他状态了。这里之所以要强调无锁的情况下，是因为在有锁的情况下，`expunged` 的状态是可以变成 `nil` 的。

此外能够将一个 key 设置成 `expunged` 的地方，也只有这里，换句话说如果这里不是 `expunged` 的话，那么在这次 lock 没有被释放之前，那么一定也不会成为 `expunged`，所以这里的可以相信 `expunged` 的检测。

## Reference
[1] [go syncmap](https://github.com/golang/sync/blob/master/syncmap/map.go)

[2] [go syncmap benchmark](https://medium.com/@deckarep/the-new-kid-in-town-gos-sync-map-de24a6bf7c2c)

[3] [cmu lockfree tutoria](https://www.cs.cmu.edu/~410-s05/lectures/L31_LockFree.pdf)
