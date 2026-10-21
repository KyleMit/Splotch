import subprocess,pathlib,json,sys,shlex,time
serial=sys.argv[1];assert serial in ['emulator-5688','emulator-5690','emulator-5686']
root=pathlib.Path(__file__).resolve().parents[1];out=root/'evidence'/serial
original=json.loads((out/'original-settings.json').read_text())['systemLocale']
def shell(command):return subprocess.run(['adb','-s',serial,'shell',command],capture_output=True,text=True,timeout=35)
read=lambda:shell('getprop persist.sys.locale').stdout.strip()
results=[]
if read()!=original:
 command='setprop persist.sys.locale '+shlex.quote(original)
 for attempt in [command,'su 0 sh -c '+shlex.quote(command)]:
  r=shell(attempt);results.append({'command':attempt,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
  if read()==original:break
record={'serial':serial,'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'original':original,'actual':read(),'localePropertyEqual':read()==original,'configuration':shell('am get-config').stdout,'attempts':results}
(out/'locale-property-final.json').write_text(json.dumps(record,indent=2)+'\n')
if (out/'restoration.json').exists():
 d=json.loads((out/'restoration.json').read_text());d['localePropertyEqual']=record['localePropertyEqual'];d['postStopLocaleCleanup']=record;(out/'restoration.json').write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps(record));assert record['localePropertyEqual']
