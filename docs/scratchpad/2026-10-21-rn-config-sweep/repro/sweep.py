import subprocess, pathlib, json, time, re, sys, xml.etree.ElementTree as ET, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
PKG='art.splotch.migration.probe'
SERIAL=sys.argv[1]
assert SERIAL in ['emulator-5686','emulator-5688','emulator-5690']
OUT=ROOT/'evidence'/SERIAL
OUT.mkdir(parents=True,exist_ok=True)
def adb(*args,binary=False):
 p=subprocess.run(['adb','-s',SERIAL,*args],capture_output=True,timeout=35)
 if p.returncode: raise RuntimeError(p.stderr.decode()+p.stdout.decode(errors='replace'))
 return p.stdout if binary else p.stdout.decode(errors='replace').strip()
def sh(cmd): return adb('shell',cmd)
def foreground():
 s=sh('dumpsys window windows' if SERIAL=='emulator-5686' else 'dumpsys window displays')
 assert re.search(r'mCurrentFocus=.*'+re.escape(PKG),s), 'Wrong foreground'
def tree():
 for attempt in range(3):
  sh('rm -f /sdcard/config-sweep.xml')
  result=sh('uiautomator dump /sdcard/config-sweep.xml')
  try:
   xml=adb('exec-out','cat','/sdcard/config-sweep.xml');ET.fromstring(xml);return xml
  except (RuntimeError,ET.ParseError):
   time.sleep(.5)
 raise RuntimeError('No fresh valid UI tree: '+result)
def nodes(xml): return [dict(x.attrib) for x in ET.fromstring(xml).iter('node')]
def tap(label,xml=None):
 foreground()
 matches=[n for n in nodes(xml or tree()) if n.get('content-desc')==label or n.get('text')==label]
 assert matches,label+' not found'
 n=matches[0]; assert n.get('enabled')=='true',label+' disabled'
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n['bounds']))
 sh(f'input tap {(x1+x2)//2} {(y1+y2)//2}')
def launch(): return sh(f'am start -W -n {PKG}/.MainActivity')
LAST_XML=None
def snapshot(label):
 global LAST_XML
 time.sleep(1.2)
 p=OUT/label
 p.with_suffix('.png').write_bytes(adb('exec-out','screencap','-p',binary=True))
 xml=tree(); LAST_XML=xml; p.with_suffix('.xml').write_text(xml)
 act=sh('dumpsys activity '+PKG);p.with_suffix('.activity.txt').write_text(act)
 ev=adb('logcat','-b','events','-d','-v','threadtime')
 ev='\n'.join(l for l in ev.splitlines() if PKG in l)
 p.with_suffix('.events.txt').write_text(ev)
 creates=[l for l in ev.splitlines() if re.search(r'(wm|am)_on_create_called',l)]
 row={'label':label,'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'serial':SERIAL,'pid':sh('pidof '+PKG),'createCountInRetainedLog':len(creates),'createEvents':creates,'localActivity':re.findall(r'Local Activity (\S+)',act),'config':re.findall(r'mCurrentConfig=(.*)',act),'controls':[{k:n.get(k) for k in ['content-desc','text','enabled','bounds']} for n in nodes(xml) if n.get('content-desc') or n.get('text')],'evidence':str(p.relative_to(ROOT))}
 with (ROOT/'results'/(SERIAL+'.jsonl')).open('a') as f:f.write(json.dumps(row)+'\n')
 print(json.dumps({k:row[k] for k in ['label','pid','createCountInRetainedLog','localActivity']}),flush=True)
 return row
def draw():
 foreground();xml=tree();ns=nodes(xml)
 paper=next(n for n in ns if n.get('content-desc')=='Drawing paper')
 x1,y1,x2,y2=map(int,re.findall(r'\d+',paper['bounds']));w=x2-x1;h=y2-y1
 pts=[(.25,.42,.25,.62),(.25,.62,.65,.62),(.65,.62,.65,.42),(.25,.42,.45,.25),(.45,.25,.65,.42),(.42,.62,.42,.49),(.42,.49,.51,.49),(.51,.49,.51,.62),(.59,.34,.59,.25)]
 for a,b,c,d in pts:sh(f'input swipe {int(x1+w*a)} {int(y1+h*b)} {int(x1+w*c)} {int(y1+h*d)} 500')
 if any(n.get('content-desc')=='Expand controls' for n in ns):tap('Expand controls',xml)
 time.sleep(.5)
def undo(label):
 tap('Undo',LAST_XML);snapshot(label+'-undo')
 foreground();xml=LAST_XML or tree();paper=next(n for n in nodes(xml) if n.get('content-desc')=='Drawing paper');x1,y1,x2,y2=map(int,re.findall(r'\d+',paper['bounds']))
 sh(f'input swipe {int(x1+(x2-x1)*.59)} {int(y1+(y2-y1)*.34)} {int(x1+(x2-x1)*.59)} {int(y1+(y2-y1)*.25)} 180')
def init():
 keys={'system':['font_scale','accelerometer_rotation','user_rotation','system_locales'],'secure':['font_weight_adjustment','high_text_contrast_enabled','navigation_mode','show_ime_with_hard_keyboard'],'global':['enable_freeform_support','force_resizable_activities','debug.force_rtl']}
 state={'serial':SERIAL,'sdk':sh('getprop ro.build.version.sdk'),'settings':{space:{k:sh(f'settings get {space} {k}') for k in ks} for space,ks in keys.items()},'density':sh('wm density'),'size':sh('wm size'),'night':sh('cmd uimode night'),'locales':sh(f'cmd locale get-app-locales {PKG}') if int(sh('getprop ro.build.version.sdk'))>=33 else 'UNSUPPORTED (API<33)','systemLocale':sh('getprop persist.sys.locale'),'overlays':sh('cmd overlay list'),'configuration':sh('am get-config'),'input':sh('dumpsys input'),'package':sh('dumpsys package '+PKG)}
 p=OUT/'original-settings.json'; assert not p.exists(),'Already initialized';p.write_text(json.dumps(state,indent=2)); print(json.dumps({k:v for k,v in state.items() if k not in ['input','package','overlays']}))
command=sys.argv[2]
if command=='init':init()
elif command=='draw':draw();snapshot(sys.argv[3] if len(sys.argv)>3 else 'baseline')
elif command=='snap':snapshot(sys.argv[3])
elif command=='undo':undo(sys.argv[3])
elif command=='tap':tap(sys.argv[3])
elif command=='change':
 label,apply,restore=sys.argv[3:6]
 before=snapshot(label+'-before');assert any(n.get('content-desc')=='Drawing paper' for n in before['controls']), 'Missing drawing baseline';assert any(n.get('content-desc')=='Undo' and n.get('enabled')=='true' for n in before['controls']), 'Undo baseline unavailable';print(sh(apply));time.sleep(1);launch();snapshot(label+'-applied');undo(label+'-applied');print(sh(restore));time.sleep(1);launch();snapshot(label+'-restored');undo(label+'-restored')
