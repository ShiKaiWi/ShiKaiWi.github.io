use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug)]
struct MMutex {
    guard: AtomicBool,
    locked: bool,
    thds_queue: Vec<thread::Thread>,
}

impl MMutex {
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

    fn unlock(&mut self) {
        while self.guard.compare_and_swap(false, true, Ordering::Relaxed) == true {}
        if !self.locked {
            panic!("unlock an unlocked mutex");
        }

        // pop the first sleep thread from the queue and then wake it up
        if self.thds_queue.len() > 0 {
            let wait_thd = self.thds_queue.remove(0);
            wait_thd.unpark();
        } else {
            self.locked = false;
        }

        self.guard.store(false, Ordering::Relaxed);
    }

    fn new() -> MMutex {
        MMutex {
            guard: AtomicBool::new(false),
            locked: false,
            thds_queue: Vec::new(),
        }
    }
}

fn main() {
    let m = Arc::new(Mutex::new(MMutex::new()));
    let mm = m.clone();
    let thd = thread::spawn(move || {
        let mut mu = mm.lock().unwrap();
        mu.lock();
        mu.unlock();
    });

    {
        let mut mu = m.lock().unwrap();
        mu.lock();
        thread::sleep(Duration::from_millis(1000));
        mu.unlock();
    }

    thd.join().expect("The thread being joined has panicked");
    println!("Original thread is joined.");
}

