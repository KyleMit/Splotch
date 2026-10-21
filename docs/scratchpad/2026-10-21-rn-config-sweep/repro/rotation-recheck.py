import sys,pathlib,subprocess,time,json
p=pathlib.Path(__file__).with_name('sweep.py');serial='emulator-5690'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
orig=json.loads((OUT/'original-settings.json').read_text())
for attempt in [1,2]:
 label=f'rotation-recheck-{attempt}'
 sh('am force-stop '+PKG);launch();time.sleep(1)
 subprocess.run([sys.executable,str(ROOT/'repro'/'draw-uinput.py'),SERIAL,label+'-before'],check=True)
 try:
  sh('settings put system accelerometer_rotation 0');sh('settings put system user_rotation 1');time.sleep(5);snapshot(label+'-portrait');undo(label+'-portrait')
  sh('settings put system user_rotation 0');time.sleep(5);snapshot(label+'-landscape');time.sleep(3);snapshot(label+'-landscape-waited');undo(label+'-landscape')
 finally:
  sh('settings put system user_rotation '+orig['settings']['system']['user_rotation']);sh('settings put system accelerometer_rotation '+orig['settings']['system']['accelerometer_rotation'])
 snapshot(label+'-restored')
