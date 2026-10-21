import pathlib,sys,subprocess,time
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1];assert serial=='emulator-5688'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
sh('am force-stop '+PKG);launch()
subprocess.run([sys.executable,str(ROOT/'repro'/'draw-uinput.py'),SERIAL,'split-fresh-2-before'],check=True)
foreground();sh('input keyevent KEYCODE_APP_SWITCH');time.sleep(1);sh('input tap 540 275')
subprocess.run([sys.executable,str(ROOT/'repro'/'os-ui.py'),SERIAL,'tap','Split screen'],check=True)
time.sleep(1);sh('input tap 540 1400');time.sleep(1);sh('input tap 120 220');snapshot('split-fresh-2-half')
foreground();sh('input swipe 540 1200 540 850 700');time.sleep(5);snapshot('split-fresh-2-small');undo('split-fresh-2-small')
sh('input swipe 540 756 540 2380 700');snapshot('split-fresh-2-restored');undo('split-fresh-2-restored')
