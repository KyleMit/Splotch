import sys
def load(p):
    d={}
    for l in open(p):
        parts=l.strip().split(' ',3)
        if len(parts)!=4: continue
        segs=parts[3].split('/')
        if segs[1]=='jobs' or segs[-1]=='.installed': continue
        d['/'.join(segs[2:])]=parts[0]
    return d
a=load(sys.argv[1]); b=load(sys.argv[2])
same=sum(1 for k in b if a.get(k)==b[k])
print(f"pack files after: {len(b)}; same inode as before (moved, not rewritten): {same}; different/new inode: {len(b)-same}")
