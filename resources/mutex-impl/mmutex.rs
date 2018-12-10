use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc};
use std::thread;
use std::time::Duration;
use std::cell::{UnsafeCell};

#[derive(Debug)]
struct Imutex {
    guard: AtomicBool,
    locked: bool,
    thds_queue: Vec<thread::Thread>, 
}

#[derive(Debug)]
struct MMutex {
    inner: UnsafeCell<Imutex>,
}

unsafe impl Sync for MMutex {}
unsafe impl Send for MMutex {}

impl Imutex {
    fn lock(&mut self) {
        println!("will lock");
        while self.guard.compare_and_swap(false, true, Ordering::Acquire) == true {}
        println!("lock: get the guard");

        if self.locked {
            self.thds_queue.push(thread::current());
            self.guard.store(false, Ordering::Release);
            // FIXME: data race here
            println!("lock: release guard & park self");
            thread::park();
        } else {
            println!("lock: get the lock & release guard");
            self.locked = true;
            self.guard.store(false, Ordering::Release);
        }
    }

    fn unlock(&mut self) {
        println!("will unlock");
        while self.guard.compare_and_swap(false, true, Ordering::Acquire) == true {}
        println!("unlock: get the guard");
        
        if !self.locked {
            panic!("unlock an unlocked mutex");
        }

        // pop the first sleep thread from the queue and then wake it up
        if self.thds_queue.len() > 0 {
            println!("unlock: unpark some other thread");
            let wait_thd = self.thds_queue.remove(0);
            wait_thd.unpark();
        } else {
            self.locked = false;
        }

        println!("unlock: release the guard");
        self.guard.store(false, Ordering::Release);
    }
}

impl MMutex {
    fn lock(&self) {
        unsafe {
            (*self.inner.get()).lock();
        }
        
    }

    fn unlock(&self) {
        unsafe {
            (*self.inner.get()).unlock();
        }
    }

    fn new() -> MMutex {
        let im = Imutex {
            guard: AtomicBool::new(false),
            locked: false,
            thds_queue: Vec::new(),
        };
        MMutex{inner: UnsafeCell::new(im)}
    }
}

fn main() {
    let m = Arc::new(MMutex::new());
    let mm = m.clone();
    let thd = thread::spawn(move || {
        mm.lock();
        mm.unlock();
    });

    {
        m.lock();
        thread::sleep(Duration::from_millis(1000));
        m.unlock();
    }

    thd.join().expect("The thread being joined has panicked");
    println!("Original thread is joined.");
}

