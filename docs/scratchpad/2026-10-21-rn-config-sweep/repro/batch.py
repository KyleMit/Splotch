import pathlib, subprocess, sys, json, time
root=pathlib.Path(__file__).resolve().parents[1]
serial=sys.argv[1]
assert serial in ['emulator-5688','emulator-5690','emulator-5686']
orig=json.loads((root/'evidence'/serial/'original-settings.json').read_text())
sdk=int(orig['sdk'])
def setting(space,key,value):
 return (f'settings put {space} {key} 0\nsettings delete {space} {key}' if key=='font_weight_adjustment' else f'settings delete {space} {key}') if value=='null' else f'settings put {space} {key} {value}'
restore=lambda space,key:setting(space,key,orig['settings'][space][key])
density=int(orig['density'].split('Physical density: ')[1].splitlines()[0])
densityRestore='wm density '+(orig['density'].split('Override density: ')[1] if 'Override density:' in orig['density'] else 'reset')
cases=[('font-largest','settings put system font_scale 2.0',restore('system','font_scale')),('font-smallest','settings put system font_scale 0.85',restore('system','font_scale')),('density-larger',f'wm density {round(density*1.25)}',densityRestore),('density-smaller',f'wm density {round(density*.8)}',densityRestore),('night-on','cmd uimode night yes','cmd uimode night '+orig['night'].split(': ')[-1]),('night-off','cmd uimode night no','cmd uimode night '+orig['night'].split(': ')[-1]),('contrast-on','settings put secure high_text_contrast_enabled 1',restore('secure','high_text_contrast_enabled'))]
if sdk>=31:cases += [('bold-on','settings put secure font_weight_adjustment 300',restore('secure','font_weight_adjustment'))]
if sdk>=33:cases += [('app-locale-fr',f'cmd locale set-app-locales art.splotch.migration.probe --user 0 --locales fr-FR',f'cmd locale set-app-locales art.splotch.migration.probe --user 0 --locales ""'),('app-locale-ar',f'cmd locale set-app-locales art.splotch.migration.probe --user 0 --locales ar',f'cmd locale set-app-locales art.splotch.migration.probe --user 0 --locales ""')]
if len(sys.argv)>2:cases=[x for x in cases if x[0] in sys.argv[2:]]
for label,apply,undo in cases:
 print('CASE '+label,flush=True)
 p=subprocess.run([sys.executable,str(root/'repro'/'sweep.py'),serial,'change',label,apply,undo],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 with (root/'results'/(serial+'-runner.txt')).open('a') as f:f.write(p.stdout)
 print(p.stdout,flush=True)
 if p.returncode:
  subprocess.run(['adb','-s',serial,'shell',undo],timeout=35)
  print('BLOCKED '+label,flush=True)
 with (root/'status.md').open('a') as f:f.write(f'- {time.strftime("%H:%MZ",time.gmtime())} — {serial}: {label} runner '+('completed; evidence awaits review.' if not p.returncode else 'blocked; restoration command issued.')+'\n')
