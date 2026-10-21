import pathlib,sys,xml.etree.ElementTree as ET,re,subprocess,time
serial,cmd=sys.argv[1:3]
assert serial in ['emulator-5686','emulator-5688','emulator-5690']
root=pathlib.Path(__file__).resolve().parents[1];out=root/'evidence'/serial
out.mkdir(parents=True,exist_ok=True)
adb=lambda *args:subprocess.check_output(['adb','-s',serial,*args],timeout=35).decode(errors='replace')
def dump():
 adb('shell','rm -f /sdcard/config-sweep-os.xml');reply=adb('shell','uiautomator dump /sdcard/config-sweep-os.xml');assert 'dumped to:' in reply,reply
 return adb('exec-out','cat','/sdcard/config-sweep-os.xml')
def guard():
 focus=adb('shell','dumpsys window')
 assert re.search(r'mCurrentFocus=.*(art.splotch.migration.probe|com.android.settings|com.android.systemui|launcher|ImmersiveModeConfirmation)',focus),focus[:300]
if cmd=='dump':
 label=sys.argv[3];xml=dump();(out/(label+'.xml')).write_text(xml)
 with (out/(label+'.png')).open('wb') as f:subprocess.run(['adb','-s',serial,'exec-out','screencap','-p'],stdout=f,check=True,timeout=35)
 for n in ET.fromstring(xml).iter('node'):
  if n.get('text') or n.get('content-desc'):print(n.get('text'),n.get('content-desc'),n.get('resource-id'),n.get('bounds'))
elif cmd=='tap':
 guard();label=sys.argv[3];xml=dump()
 ns=[n for n in ET.fromstring(xml).iter('node') if label in [n.get('text'),n.get('content-desc'),n.get('resource-id')]]
 assert ns,label+' missing';b=list(map(int,re.findall(r'\d+',ns[0].get('bounds'))));adb('shell',f'input tap {(b[0]+b[2])//2} {(b[1]+b[3])//2}')

if cmd=='point':
 guard();x,y=sys.argv[3:5];adb('shell',f'input tap {int(x)} {int(y)}')
elif cmd=='swipe':
 guard();x1,y1,x2,y2,duration=map(int,sys.argv[3:8]);adb('shell',f'input swipe {x1} {y1} {x2} {y2} {duration}')
