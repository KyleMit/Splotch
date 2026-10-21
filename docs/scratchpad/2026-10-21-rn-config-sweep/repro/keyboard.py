import sys, pathlib, json, subprocess, time
# Load the local driver without invoking its command dispatch.
p=pathlib.Path(__file__).with_name('sweep.py')
sys.argv=[str(p),sys.argv[1],'library']
exec(compile(p.read_text(),str(p),'exec'))
label='hardware-keyboard-direct'
snapshot(label+'-before')
events=[{'id':15,'command':'register','name':'Config Sweep USB Keyboard','vid':6353,'pid':20226,'bus':'usb','port':'usb:config-sweep','configuration':[{'type':'UI_SET_EVBIT','data':[1]},{'type':'UI_SET_KEYBIT','data':list(range(1,256))}]},{'id':15,'command':'delay','duration':40000}]
f=OUT/'keyboard.jsonl';f.write_text('\n'.join(json.dumps(x) for x in events)+'\n')
adb('push',str(ROOT/'repro'/'config-input-arm64'),'/data/local/tmp/config-sweep-input');sh('chmod 755 /data/local/tmp/config-sweep-input')
with (OUT/'keyboard-run.txt').open('wb') as log:
 child=subprocess.Popen(['adb','-s',SERIAL,'shell',*(['su','0'] if SERIAL=='emulator-5686' else []),'/data/local/tmp/config-sweep-input','keyboard','30'],stdout=log,stderr=log)
 try:
  time.sleep(2);(OUT/'keyboard-attached-input.txt').write_text(sh('dumpsys input'))
  snapshot(label+'-attached');undo(label+'-attached')
 finally:
  try:child.wait(timeout=45)
  except subprocess.TimeoutExpired:
   child.terminate();child.wait(timeout=5)
 time.sleep(1)
snapshot(label+'-detached');undo(label+'-detached')
sh('rm -f /data/local/tmp/config-sweep-keyboard.jsonl')
