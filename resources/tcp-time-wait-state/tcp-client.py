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
