import json,sys,os,re
root=sys.argv[1]
for d in sorted(os.listdir(root), key=lambda s: float(s)):
    k=open(os.path.join(root,d,'killed.json')).read(); r=open(os.path.join(root,d,'resumed.json')).read()
    kj=json.loads(k[:k.rindex('}')+1]); rj=json.loads(r[:r.rindex('}')+1])
    def stats(j):
        legacy=sum(1 for b in j['books'] if b.startswith('1.6.0'))
        trusted=sum(1 for v in j['books'].values() if v.startswith('trusted'))
        newfiles=sum(int(re.search(r'files=(\d+)',v).group(1)) for b,v in j['books'].items() if b.startswith('full/'))
        oldfiles=sum(int(re.search(r'files=(\d+)',v).group(1)) for b,v in j['books'].items() if b.startswith('1.6.0'))
        return f"top={','.join(sorted(j['topLevel']))} trusted={trusted} newNsFiles={newfiles} legacyFiles={oldfiles} violations={len(j['violations'])}"
    cmp=open(os.path.join(root,d,'resumed-compare.txt')).read().splitlines()
    print(f"kill@{d}s | killed: {stats(kj)} | resumed: {stats(rj)} | {cmp[1].split(': ')[1]} kept, {cmp[2].split(': ')[1]} rewritten")
