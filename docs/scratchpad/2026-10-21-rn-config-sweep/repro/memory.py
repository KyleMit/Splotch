import pathlib,sys,json,time,re
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1];prior_trim=len(sys.argv)>2 and sys.argv[2]=='after-accepted-trim'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
launch();time.sleep(1)
uid=re.search(r'\buid:(\d+)',sh('pm list packages -U '+PKG)).group(1)
def background(label):
 foreground();sh('input keyevent KEYCODE_HOME');history=[]
 for attempt in range(40):
  state=sh('am get-uid-state '+uid);history.append(state)
  match=re.match(r'(\d+)',state)
  if match and int(match[1])>=10:break
  time.sleep(.5)
 (OUT/(label+'-uid-states.json')).write_text(json.dumps(history,indent=2)+'\n')
 assert match and int(match[1])>=10,'Process not demoted to background'
if not prior_trim:
 snapshot('trim-running-before');background('trim')
 accepted='NONE'
 for level in ['COMPLETE','RUNNING_CRITICAL']:
  try:
   receipt=sh('am send-trim-memory '+PKG+' '+level)
   (OUT/('trim-'+level+'-receipt.txt')).write_text(receipt)
   accepted=level;break
  except RuntimeError as error:
   (OUT/('trim-'+level+'-rejected.txt')).write_text(str(error))
 (OUT/'trim-accepted-level.txt').write_text(accepted)
else:
 assert SERIAL=='emulator-5690' and (OUT/'trim-retry.txt').exists()
 (OUT/'trim-accepted-level.txt').write_text('COMPLETE: prior accepted receipt trim-retry.txt; later return captures')
(OUT/'trim-background-pid.txt').write_text(sh('pidof '+PKG+' || true'))
launch();snapshot('trim-return');undo('trim-return')
snapshot('kill-before');background('kill')
for attempt in range(20):
 sh('am kill '+PKG);time.sleep(.5)
 pid=sh('pidof '+PKG+' || true')
 if not pid:break
(OUT/'kill-background-pid.txt').write_text(pid);assert not pid,'am kill did not kill background process'
launch();snapshot('kill-return')
