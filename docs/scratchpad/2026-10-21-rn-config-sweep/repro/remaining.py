import pathlib,sys,subprocess,json,time
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1]
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
orig=json.loads((OUT/'original-settings.json').read_text())
def run(label,apply,restore):
 print('CASE '+label,flush=True)
 result=subprocess.run([sys.executable,str(p),SERIAL,'change',label,apply,restore],capture_output=True,text=True)
 print(result.stdout+result.stderr,flush=True)
 if result.returncode:print('BLOCKED '+label,flush=True);sh(restore)
 with (ROOT/'status.md').open('a') as f:f.write(f'- {time.strftime("%H:%MZ",time.gmtime())} — {SERIAL}: {label} '+('captured.' if not result.returncode else 'blocked; restoration issued.')+'\n')
def restore(space,key):
 v=orig['settings'][space][key];return f'settings delete {space} {key}' if v=='null' else f'settings put {space} {key} {v}'
adb('push',str(ROOT/'repro'/'locale-helper'/'classes.dex'),'/data/local/tmp/config-sweep-locale.dex')
locale='CLASSPATH=/data/local/tmp/config-sweep-locale.dex app_process /system/bin ConfigLocale '
originalLocales=re.search(r'-([^\n]*?)-ldl',orig['configuration'])
# The allowed emulators begin in English; effective language is recorded independently in original-settings.json.
assert 'en-rUS' in orig['configuration'] or 'en-US' in orig['configuration']
for lang in ['fr-FR','ar']:run('system-locale-'+lang,locale+lang,locale+'en-US')
natural_landscape=int(re.findall(r'(\d+)x(\d+)',orig['size'])[0][0])>int(re.findall(r'(\d+)x(\d+)',orig['size'])[0][1])
run('rotation-portrait' if natural_landscape else 'rotation-landscape','settings put system accelerometer_rotation 0\nsettings put system user_rotation 1',restore('system','user_rotation')+'\n'+restore('system','accelerometer_rotation'))
run('rotation-landscape' if natural_landscape else 'rotation-portrait','settings put system accelerometer_rotation 0\nsettings put system user_rotation 0',restore('system','user_rotation')+'\n'+restore('system','accelerometer_rotation'))
if 'com.android.internal.systemui.navbar.threebutton' in orig['overlays']:
 enabled=re.search(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w_]+)',orig['overlays'])
 if enabled:
  run('navigation-threebutton','cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.threebutton','cmd overlay enable-exclusive --category '+enabled[1])
  if '.gestural' in orig['overlays']:run('navigation-gestural','cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural','cmd overlay enable-exclusive --category '+enabled[1])
subprocess.run([sys.executable,str(ROOT/'repro'/'keyboard.py'),SERIAL])
subprocess.run([sys.executable,str(ROOT/'repro'/'memory.py'),SERIAL],check=True)
sh(restore('system','system_locales'))
sh('rm -f /data/local/tmp/config-sweep-locale.dex')
