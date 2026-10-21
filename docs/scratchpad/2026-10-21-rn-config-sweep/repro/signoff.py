import pathlib,sys,json,re,time,shlex
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1]
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
orig=json.loads((OUT/'original-settings.json').read_text())
for space,items in orig['settings'].items():
 for key,value in items.items():
  current=sh(f'settings get {space} {key}')
  if current!=value:
   if value=='null':
    if key in ['font_weight_adjustment','high_text_contrast_enabled','enable_freeform_support','force_resizable_activities']:sh(f'settings put {space} {key} 0')
    sh(f'settings delete {space} {key}')
   else:sh(f'settings put {space} {key} {value}')
if int(orig['sdk'])>=31 and 'fontWeightAdjustment=0' in orig['configuration']:
 sh('settings put secure font_weight_adjustment 0')
 if orig['settings']['secure']['font_weight_adjustment']=='null':sh('settings delete secure font_weight_adjustment')
nav=re.search(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w_]+)',orig['overlays'])
if nav:sh('cmd overlay enable-exclusive --category '+nav[1])
if sh('wm density')!=orig['density']:sh('wm density '+(orig['density'].split('Override density: ')[-1] if 'Override density:' in orig['density'] else 'reset'))
sh('cmd uimode night '+orig['night'].split(': ')[-1])
if int(orig['sdk'])>=33 and sh('cmd locale get-app-locales '+PKG)!=orig['locales']:sh('cmd locale set-app-locales '+PKG+' --user 0 --locales ""')
property_result=None
if sh('getprop persist.sys.locale')!=orig['systemLocale']:
 property_result=subprocess.run(['adb','-s',SERIAL,'shell','setprop persist.sys.locale '+shlex.quote(orig['systemLocale'])],capture_output=True,text=True,timeout=35)
 (OUT/'locale-property-restoration.txt').write_text(property_result.stdout+property_result.stderr)
 if sh('getprop persist.sys.locale')!=orig['systemLocale']:
  rooted=subprocess.run(['adb','-s',SERIAL,'shell','su 0 sh -c '+shlex.quote('setprop persist.sys.locale '+shlex.quote(orig['systemLocale']))],capture_output=True,text=True,timeout=35)
  with (OUT/'locale-property-restoration.txt').open('a') as f:f.write(rooted.stdout+rooted.stderr)
launch();snapshot('final-restored')
state={'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'serial':SERIAL,'settings':{space:{key:sh(f'settings get {space} {key}') for key in items} for space,items in orig['settings'].items()},'density':sh('wm density'),'size':sh('wm size'),'night':sh('cmd uimode night'),'locales':sh('cmd locale get-app-locales '+PKG) if int(orig['sdk'])>=33 else 'UNSUPPORTED (API<33)','systemLocale':sh('getprop persist.sys.locale'),'overlays':sh('cmd overlay list'),'configuration':sh('am get-config'),'activity':sh('dumpsys activity '+PKG),'input':sh('dumpsys input')}
state['localePropertyEqual']=state['systemLocale']==orig['systemLocale'];state['storedSettingsEqual']=state['settings']==orig['settings'];state['densityEqual']=state['density']==orig['density'];state['sizeEqual']=state['size']==orig['size'];state['nightEqual']=state['night']==orig['night'];state['appLocalesEqual']=state['locales']==orig['locales'];state['enabledNavEqual']=re.findall(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w_]+)',state['overlays'])==re.findall(r'\[x\] (com\.android\.internal\.systemui\.navbar\.[\w_]+)',orig['overlays']);state['virtualDeviceRemoved']='Config Sweep Keyboard' not in state['input'] and 'Config Sweep Touchscreen' not in state['input']
(OUT/'restoration.json').write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps({k:v for k,v in state.items() if k.endswith('Equal') or k=='virtualDeviceRemoved'}),flush=True)
sh('rm -f /data/local/tmp/config-sweep-input /data/local/tmp/config-sweep-keyboard.jsonl /data/local/tmp/config-sweep-touch.jsonl /data/local/tmp/config-sweep-touch.txt /data/local/tmp/config-sweep-exit-touch.txt /data/local/tmp/config-sweep-locale.dex /sdcard/config-sweep.xml /sdcard/config-sweep-os.xml')
sh('am force-stop '+PKG)
(OUT/'stopped-pid.txt').write_text(sh('pidof '+PKG+' || true'))
print('Probe stopped; temporary helper files removed.',flush=True)
