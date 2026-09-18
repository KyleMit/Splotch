# Per-thread frame counts from macOS sample(1) text reports; see the README beside this file.
import hashlib, json, re, sys

FRAMES = {
    'drawImage': 'jsCanvasRenderingContext2DPrototypeFunction_drawImage',
    'ensureBackend': 'RemoteImageBufferProxy::ensureBackend',
    'shareableBitmapCopy': 'ShareableBitmap::createFromImagePixels',
    'ioSurfaceClientLock': 'IOSurfaceClientLock',
    'ioSurfaceCreateImage': 'IOSurface::createImage',
    'caCgQueueFlush': 'CA::CG::Queue::flush',
    'accelDetach': 'CA::CG::AccelDataProvider::detach',
    'ioSurfaceCopyData': 'CA::CG::IOSurfaceDataProvider::copy_data',
    'metalDraw': 'CA::OGL::MetalContext::draw',
}
THREAD = re.compile(r'^\s{4}(\d+)\s+(Thread_\S+.*)')
LINE = re.compile(r'^[\s+!:|]*(\d+)\s+(.*)')

def threads(text):
    lines = text.split('\n'); out = []; i = 0
    while i < len(lines):
        m = THREAD.match(lines[i])
        if not m: i += 1; continue
        j = i + 1; body = []
        while j < len(lines) and lines[j].strip() and not THREAD.match(lines[j]):
            body.append(lines[j]); j += 1
        out.append((m.group(2), int(m.group(1)), body)); i = j
    return out

# Per thread, the largest count on any call-tree line naming the frame: a lower
# bound on the thread's samples under that frame (separate paths are not summed).
def heaviest(body, frame):
    best = 0
    for line in body:
        m = LINE.match(line)
        if m and frame in m.group(2): best = max(best, int(m.group(1)))
    return best

def count_file(path):
    raw = open(path, 'rb').read()
    text = raw.decode('utf-8', 'replace')
    row = {'sha256': hashlib.sha256(raw).hexdigest()}
    for name, total, body in threads(text):
        key = ('main' if 'com.apple.main-thread' in name else 'rrb' if 'RemoteRenderingBackend work queue' in name
               else 'caQueue' if 'CA::CG::Queue' in name else None)
        if not key: continue
        row[key] = {'samples': total, **{k: heaviest(body, f) for k, f in FRAMES.items()}}
    return row

if __name__ == '__main__':
    print(json.dumps({p.rsplit('/', 1)[-1]: count_file(p) for p in sys.argv[1:]}, indent=1))
