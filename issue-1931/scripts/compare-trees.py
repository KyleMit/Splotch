import os, sys, hashlib
def load(root):
    d={}
    for ns in os.listdir(root):
        p=os.path.join(root,ns)
        if ns=='jobs' or not os.path.isdir(p): continue
        for dp,_,fs in os.walk(p):
            for f in fs:
                if f=='.installed': continue
                full=os.path.join(dp,f); rel=os.path.relpath(full,p)
                d[rel]=(int(os.stat(full).st_mtime), hashlib.sha256(open(full,'rb').read()).hexdigest())
    return d
a=load(sys.argv[1]); b=load(sys.argv[2])
kept=[k for k in b if k in a and a[k]==b[k]]
rewritten=[k for k in b if k not in kept]
gone=[k for k in a if k not in b]
print(f"pack files before: {len(a)}  after: {len(b)}")
print(f"kept byte-identical with original mtime (not re-downloaded): {len(kept)}")
print(f"new or rewritten since snapshot: {len(rewritten)}")
for k in rewritten[:20]: print("   ", k)
print(f"removed since snapshot: {len(gone)}")
for book in sorted({g.split('/')[0] for g in gone}): print(f"    book {book}: {sum(1 for g in gone if g.startswith(book+'/'))} files")
