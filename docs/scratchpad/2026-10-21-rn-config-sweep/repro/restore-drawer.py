import pathlib,subprocess,re,json,sys,shlex,time
serial=sys.argv[1];assert serial in ['emulator-5688','emulator-5690','emulator-5686']
root=pathlib.Path(__file__).resolve().parents[1];repo=root.parents[2];pkg='art.splotch.migration.probe';out=root/'evidence'/serial
out.mkdir(parents=True,exist_ok=True)
key=re.search(r"drawerOpen:\s*'([^']+)'",(repo/'web/src/lib/storageKeys.ts').read_text()).group(1);assert re.fullmatch('[a-z0-9-]+',key)
def shell(command):return subprocess.check_output(['adb','-s',serial,'shell',command],text=True,timeout=35).strip()
def rooted(command):return shell('su 0 sh -c '+shlex.quote(command))
assert not shell('pidof '+pkg+' || true'),'Stop the probe before restoring its stored preference'
file=f'/data/user/0/{pkg}/files/{key}'
found=rooted(f'if test -f {shlex.quote(file)}; then echo present; else echo absent; fi')
if found=='absent':
 paths=rooted(f'find /data/user/0/{pkg}/files -maxdepth 3 -name {shlex.quote(key)}').splitlines();assert len(paths)==1,paths;file=paths[0]
before=rooted('cat '+shlex.quote(file));assert before in ['true','false'],before
rooted("printf '%s' false > "+shlex.quote(file));after=rooted('cat '+shlex.quote(file));assert after=='false'
bases={'emulator-5688':'evidence/api34-initial.xml: Expand controls','emulator-5690':'evidence/emulator-5690/onboarding-current.xml: Expand controls','emulator-5686':'evidence/emulator-5686/initial-system-prompt.png: underlying upward chevron, closed drawer'}
row={'serial':serial,'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'originalOpen':False,'originalEvidence':bases[serial],'storageKey':key,'file':file,'beforeFileValue':before,'afterFileValue':after,'drawerPreferenceRestored':True,'source':'experiments/native-architecture/src/platform/drawerOpen.ts and rsdDrawing/RsdEdgeControls.tsx'}
(out/'drawer-restoration.json').write_text(json.dumps(row,indent=2)+'\n')
p=out/'restoration.json'
if p.exists():
 r=json.loads(p.read_text());r['drawerPreferenceRestored']=True;p.write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(row))
