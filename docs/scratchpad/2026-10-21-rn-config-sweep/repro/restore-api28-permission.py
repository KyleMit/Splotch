import sys,pathlib,json,shlex
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1];assert serial=='emulator-5686'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
rootsh=lambda command:sh('su 0 sh -c '+shlex.quote(command))
flags=json.loads((OUT/'save-permission-before.json').read_text());sh('am force-stop '+PKG)
for row in flags:sh('pm '+('grant' if row['permissionCheck']==0 else 'revoke')+' '+PKG+' '+row['permission'])
adb('push',str(ROOT/'repro'/'locale-helper'/'classes.dex'),'/data/local/tmp/config-sweep-permission.dex')
result=rootsh('CLASSPATH=/data/local/tmp/config-sweep-permission.dex app_process /system/bin QaPermissionFlags restore-user '+' '.join(str(r['afterFlags']) for r in flags))
restored=[json.loads(line) for line in result.splitlines() if line.startswith('{')]
assert [(r['afterFlags'],r['permissionCheck']) for r in restored]==[(r['afterFlags'],r['permissionCheck']) for r in flags]
PREF=f'/data/user/0/{PKG}/shared_prefs/splotch-photo-permission.xml';BACKUP='/data/local/tmp/config-sweep-photo-pref.xml'
if (OUT/'save-pref-baseline.txt').read_text()=='present':rootsh(f'cp -a {BACKUP} {PREF} && restorecon {PREF} && rm -f {BACKUP}')
else:rootsh(f'rm -f {PREF} {BACKUP}')
(OUT/'save-permission-restored.json').write_text(json.dumps(restored,indent=2)+'\n');sh('rm -f /data/local/tmp/config-sweep-permission.dex')
print('Storage grants, user permission flags and photo-permission preference restored.')
