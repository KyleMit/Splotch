# serve.py <root> <port> <logfile> [throttle-path] [bytes-per-second]
import http.server, os, sys, time, datetime
root, port, logfile = sys.argv[1], int(sys.argv[2]), sys.argv[3]
throttle_path = sys.argv[4] if len(sys.argv) > 4 else None
bps = int(sys.argv[5]) if len(sys.argv) > 5 else 0
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
    def log_message(self, fmt, *args):
        with open(logfile, 'a') as f:
            f.write(f"{datetime.datetime.now().isoformat(timespec='milliseconds')} {self.address_string()} {fmt % args}\n")
    def copyfile(self, source, outputfile):
        if throttle_path and self.path == throttle_path and bps:
            while chunk := source.read(max(1, bps // 10)):
                outputfile.write(chunk); outputfile.flush(); time.sleep(0.1)
        else:
            super().copyfile(source, outputfile)
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
