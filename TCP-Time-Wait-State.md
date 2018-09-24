# TCP Time Wait State

### 什么是 Time Wait 状态？
`time wait` 是 tcp connection 的状态之一，进入这个状态的原因只有一种：主动关闭 connection （active close）。

与其相对的是 `close wait` 状态，该状态是由于被动关闭 connection（passive close）而进入的，也就是说接收到了对方的 `FIN` 信号（并且发出了自己的 `ACK` 信号）。

在弄懂这个问题时，笔者遇到了这样一个的理解困难，必须理解了这一点，下面的表述才会理解比较顺畅——就是当我们讨论 tcp connection 状态时，实际上讨论的是在某个 end point 上的该 tcp connection 的状态。

### 问题
工作中需要写一个 tcp server，为了寻求快速开发，直接用了 python 来完成这一工作，开发完毕之后，遇到一个问题：因为需要每天重启这个 tcp server，然而每次重启的都会出错，错误信息如下：
```
socket.error: [Errno 48] Address already in use
```

### 复现
为了解决这个问题，我写了一个简单的 tcp echo server/client，以此来重现我的问题：

[server 代码](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/tcp-time-wait-state/tcp-server.py)
```python
# server
#!/usr/bin/env python

import socket
port = 8080
backlog = 5

def echo(conn):
    conn.settimeout(1)
    data = conn.recv(1024)
    conn.send(data)
    conn.close()
    pass


def run():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    s.bind(("", port))
    s.listen(backlog)
    print "server listen on:", port

    try:
        while True:
            conn, addr = s.accept()
            print "new connection comes, addr=", addr
            echo(conn)

    except Exception as e:
        print "tcp server execption occured=", e
    finally:
        s.close()


if __name__ == "__main__":
    run()
```

[client 代码](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/tcp-time-wait-state/tcp-client.py)
```python
import socket

host = 'localhost'
port = 8080

def run():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    except socket.error as msg:
        return
    try:
        s.connect((host, port))
    except socket.error as msg:
        s.close()
        return
    s.sendall('helle,world')
    echo = s.recv(1024)
	  s.close()
    print "got echo data: ", echo


if __name__ == "__main__":
    run()
```

代码逻辑很简单，就是 server  接收到 client 发来的数据后，将其再返回给 client（echo）。

我们先运行 server，再运行 client，client 收到 reply 之后，会立即结束运行。此时此刻，如果我们重启 server，会立即得到上面出现的错误：
```
socket.error: [Errno 48] Address already in use
```

### 原因
那么这个错误是怎么回事呢？

其实在本文的开始，就提到了 `time wait` 这一状态，而这里的错误其实并不是一种错误，而是 tcp 的机制导致的正常后果。

解决方法很简单，下面主要解释其中的原因。

![](https://github.com/ShiKaiWi/ShiKaiWi.github.io/blob/master/resources/tcp-time-wait-state/tcp-state-diagram.png)
来自 [RFC 793 - Transmission Control Protocol](https://tools.ietf.org/html/rfc793)

让我们回到 client 接收到 echo 之后，立即停止运行的时候。在这之前，我们的 echo server 已经主动 close 了这个 tcp connection 了，而到了此刻，client 也发出了 close tcp connection 的 FIN 包。如果 server 端已经接收到了来自 client 端的 FIN 包，根据 tcp connection state diagram，我们可以发现 server 端会发出相应的 ACK 包，并且进入 `time wait` 状态。

注意，一旦进入了 `time wait` 状态，由图中可以发现必须经过 2MSL 的时间才会真正进入 CLOSED 状态。这里的 MSL 是 `maximum segment lifetime`的缩写，一个 MSL 是指一个 tcp segment 在网络中的最大存活时间， 不同的实现有不同的设置，一般是两分钟。

到这里，我们就可以给出问题的具体原因了，其实就是在我们重启 server 的时候，由于上一次的 tcp connection 还没进入 closed 状态，还处于 `time wait` 状态，从而导致相应的 port 还在使用，也就是 `Address already in use`.

最终的解决方案很简单，我们在开启 socket 的之前，允许 socket 端口重用，也即是重启的时候，我们直接使用之前的 port 来启动 tcp server，而相应的 python 代码其实只有一行：
```python
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
```

### Time Wait 意义
到这里，问题其实已经解决了，但是有几个小问题，值得我们思考一下：
```
1. why is time wait state necessary?
2. why should connection not set as closed until 2MSL passed?
3. why does close wait act differently from time wair?
```

下面一一解释这三个问题。

首先，我们最关心的一个问题就是：`time wait` 究竟是为了什么而被提出来的。在这之前我们可以先了解一下，任何一个 `tcp connection` 都可以用一个四元组来表示：
```
(local_addr, local_port, remote_addr, remote_port)
```
这个四元组的意义十分明显，不做过多解释。

此外另一个事实就是，在 IP 层中，虽然当前的 tcp connection 已经关闭了，但是仍有可能存在着一些之前因为重发而导致的游荡重复包（wandering duplicate），这些包我们认为在 `[0, 2MSL)`（数据包和相应的 ack 包各需要 1MSL）的时间内都有可能再次来到，因此如果我们的四元组没有变化，并且没有 `time wait` 这个状态的话，会产生一个严重的问题 ——（以 echo server 举例）游荡重复包如果到达了一个刚刚重新启动过的 server 端，那么 server 端将无法对新建 connection 的包和上一次 connection 的游荡包做出区分，从而导致当前的 tcp connection 被上次的数据包污染。但是如果我们加上了 `time wait` 状态，那么这个问题就会迎刃而解，因为 server 专门有 2MSL 的时间去处理那些 wandering 包。

除此之外，还有一个原因是，为了处理 server 最终发出的 FIN 包和 ACK 包丢失情况，也必须要有一个类似 `time wait` 状态去支持相应的重发。

至于为什么需要 2MSL 的时间长度，是因为 tcp 是一个全双工的协议，发出的数据包必须得到 ack 之后才算完整，一来一回就是 2MSL 的估计量。

最后的问题是：为什么 `close wait` 状态不像 `time wait` 状态那样需要等待 2MSL ？

这个问题乍看之下有点难以回答，但是其实答案十分简单，因为一个 connection 如果在一个 end point 上处于 `close wait`，那么必然在另一个 end point 上是处于 `time wait` 状态，而一个 tcp connection 是由上述提到的一个四元组所标志的，自然只要一个 end point 能够解决 wandering 包的问题即可，所以 `close wait` 自然不需要像 `time wait` 那样等待 2MSL 的时间。

### 参考
[1] [RFC 793 - Transmission Control Protocol](https://tools.ietf.org/html/rfc793)

[2] [time wait and its design implication](http://www.serverframework.com/asynchronousevents/2011/01/time-wait-and-its-design-implications-for-protocols-and-scalable-servers.html)
