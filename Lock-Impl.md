# Lock-Implement

## 背景
现在多线程编程已经非常普遍了，多线程中为了保证共享资源的操作安全，引入了锁，锁的 api 很简单：`lock`和 `unlock`，在正常的工作中也是经常被使用，但是锁的实现一般很少被提及，我也是在好奇心的驱使下，查了相关资料。

本文会介绍一种锁的实现（使用 rust 实现），以帮助读者理解锁的机制。

## 原理
### 硬件基础
目前主流的锁的实现，是需要硬件基础的，也就是说必须存在一些重要的原子操作，来保证一些操作在多线程下是安全的。

有一个基本常识就是在主流的高级语言中，大部分的 statement 都不是原子的，比如：
```
a = 12
```
在 C 里面，这个 statement 会被编译成多条汇编，执行到任意一条汇编的时候，都会发生 context swtich，换句话说，这个 statement 虽然看上去只有一行，但是在真正执行的时候，可能是由多个汇编语句执行的，也就是不是原子的。

高级语言一般都会提供原子操作，比如 golang 的 `sync/atomic` 包，rust 的 `std::sync::atomic`。这些原子操作除了读和写，其实还有一个重要的操作，一般叫做 `CompareAndSwap`（也有其他结果上等价的操作，比如 `TestAndSet`），其本质都是 write-after-read ，也就是说读某个值之后根据这个值进行写入，其实就是存在 data dependency。

write-after-read 的原子性，是 lock-free 和 lock 的起点。

### 实现
我用 rust 写了一份[实现](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/lock-impl/mmutex.rs)，然而由于 rust 本身强大的静态检查，导致我根本无法测试我的 mutex 的正确性，所以下面的代码如果有一些遗漏和错误，还望读者指出。

首先看一下 mutex 的 struct：
```rust
#[derive(Debug)]
struct MMutex {
	guard: AtomicBool,
	locked: bool,
	thds_queue: Vec<thread::Thread>,
}
```

其中的 `locked` 是记录该 `mutex` 是否被 `lock` 住，`guard` 是用来做 `locked`和 `thds_queue` 的单线程保护的（这里其实是一个自旋锁），`thds_queue` 是在当前锁的上的等待线程队列，等到锁的资源被释放的时候，会唤醒其中一个等待的线程。

下面看一下 `lock` 方法：
```rust
fn lock(&mut self) {
	while self.guard.compare_and_swap(false, true, Ordering::Relaxed) == true {}

	if self.locked {
		self.thds_queue.push(thread::current());
		self.guard.store(false, Ordering::Relaxed);
		// FIXME: data race here
		thread::park();
	} else {
		self.locked = true;
		self.guard.store(false, Ordering::Relaxed);
	}
}
```

这里我们可以看到，`lock` 方法一进来，就是一个 while 循环，调用了 `guard.compare_and_swap(false, true, Ordering::Relaxed)` ，这里的含义其实就是如果原来的值是 `false`，则设置为 `true`，并且返回 `false`（old value），否则就不设置，返回 `true`，从而形成一个简单的自旋锁就完成了，一旦 while 循环终止了，那么任何其他使用了相同技巧的地方就无法进入关键区，也就达到了保护 `locked`和 `thds_queue` 这两个变量的效果。

这里读者可能有一个疑问，就是 `Ordering::Relaxed` 这个参数是什么意思，对于写过 cpp 的读者来说可能不会陌生，但是对于只写过 golang 之类的读者来说，可能就比较陌生了，关于这个话题，笔者会在另外一篇文章中做更详细的阐述。

拿到自旋锁之后，我们会检查 `locked`，如果已经被锁住了，则将当前线程加入到 `thds_queue` 中，以便后来唤醒。然后我们释放自旋锁，并且将当前线程设置为 blocked 状态，等待 resume。

如果没有被锁住，则获取到锁的资源（设置 `locked = ture`），然后释放自旋锁。

`lock` 的整体实现非常简单，我们再看一下 `unlock` 的实现：
```rust
fn unlock(&mut self) {
	while self.guard.compare_and_swap(false, true, Ordering::Relaxed) == true {}
	if !self.locked {
		panic!("unlock an unlocked mutex");
	}
	self.locked = false;

	// pop the first sleep thread from the queue and then wake it up
	if self.thds_queue.len() > 0 {
		let wait_thd = self.thds_queue.remove(0);
		wait_thd.unpark();
	}

	self.guard.store(false, Ordering::Relaxed);
}
```

和 `lock` 一样，我们必须先获得自旋锁，才能进入关键区，然后，检查是否 `locked`，如果没有锁住，那么直接 panic，因为 unlock 一个 unlocked 的 mutex 是非常严重的逻辑错误。

如果锁住了，需要释放锁，但是同时如果有 blocked 的线程，也需要取出一个线程将其 resume，这里是使用的是 FIFO 的策略，因此选择了头部的线程进行 resume。

最终释放自旋锁，完成 `unlock` 操作。

虽然这里十分简陋，肯定不能当做生产环境中的 `mutex`，但是我想核心原理都差不多。不过可惜的是，rust 的静态检查比较强大，目前我还没发现如何使用上我的这个 `mutex` 来进行共享状态的多线程读写保护。

### 问题
其实这里有个非常严重的问题，代码中也加入了 comment：
```rust
fn lock(&mut self) {
	//...
	if self.locked {
		self.thds_queue.push(thread::current());
		self.guard.store(false, Ordering::Relaxed);
		// FIXME: data race here
		thread::park();
	}
	//...
}
```

我们在调用 `lock` 的时候，发现锁已经被其他线程持有了，我们需要 park 当前线程，但是在 `park` 之前又必须先将当前线程放入等待线程队列里面去，因此这里其实存在 data race：当 `guard` 刚刚被释放掉，另一个线程直接因此拿到自旋锁之后，对刚刚放入的等待线程队列中的当前线程执行 `unpark`操作，但是之后又回到当前线程，准备执行 `park` 操作，这样直接导致了当前线程永远处于 blocked 状态。

一般来说解决这个问题需要更底层的支持（不同的平台提供的接口可能都不一致）：比如类似提供一种 `set_park` 这样的接口，表明当前线程将会在执行完下一个原子操作之后，被设为 blocked 状态，并且如果另一个线程对当前线程调用了 `unpark` 操作，那么这个标记就会被取消，从而避免掉上述的问题，代码需要微微调整一下：
```rust
fn lock(&mut self) {
	//...
	if self.locked {
		self.thds_queue.push(thread::current());
		thread::set_park(||self.guard.store(false, Ordering::Relaxed));
	}
	//...
}
```

## Ref
[1] [ostep-threads-lock](http://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks.pdf)

