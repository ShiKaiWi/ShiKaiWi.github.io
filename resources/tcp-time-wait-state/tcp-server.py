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
    # uncommenting this line will lead to successful immediate restarting
    # s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

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
