import pathlib,sys,json,re,time,shlex
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1];label=sys.argv[2] if len(sys.argv)>2 else 'baseline-uinput'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
foreground();xml=tree();ns=nodes(xml);paper=next(n for n in ns if n.get('content-desc')=='Drawing paper')
x1,y1,x2,y2=map(int,re.findall(r'\d+',paper['bounds']));w=x2-x1;h=y2-y1
size=sh('wm size');width,height=map(int,re.findall(r'(\d+)x(\d+)',size)[-1])
lines=[(.25,.32,.25,.57),(.25,.57,.65,.57),(.65,.57,.65,.32),(.25,.32,.45,.18),(.45,.18,.65,.32),(.42,.57,.42,.43),(.42,.43,.51,.43),(.51,.43,.51,.57),(.59,.27,.59,.18)]
f=OUT/(label+'-touch.txt');f.write_text(f'{width} {height}\n'+'\n'.join(' '.join(str(v) for v in [int(x1+w*a),int(y1+h*b),int(x1+w*c),int(y1+h*d)]) for a,b,c,d in lines)+'\n')
adb('push',str(ROOT/'repro'/'config-input-arm64'),'/data/local/tmp/config-sweep-input');sh('chmod 755 /data/local/tmp/config-sweep-input')
adb('push',str(f),'/data/local/tmp/config-sweep-touch.txt')
try:print(sh('/data/local/tmp/config-sweep-input touch /data/local/tmp/config-sweep-touch.txt'))
except RuntimeError as error:
 (OUT/(label+'-shell-input-error.txt')).write_text(str(error))
 print(sh('su 0 sh -c '+shlex.quote('/data/local/tmp/config-sweep-input touch /data/local/tmp/config-sweep-touch.txt')))
sh('rm -f /data/local/tmp/config-sweep-touch.txt /data/local/tmp/config-sweep-touch.jsonl')
if any(n.get('content-desc')=='Expand controls' for n in ns):tap('Expand controls',xml)
snapshot(label)
