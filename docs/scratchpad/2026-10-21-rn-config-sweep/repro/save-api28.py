import sys,pathlib,json,re,time,shlex
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1];assert serial=='emulator-5686'
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
orig=json.loads((OUT/'original-settings.json').read_text())
rootsh=lambda command:sh('su 0 sh -c '+shlex.quote(command))
PREF=f'/data/user/0/{PKG}/shared_prefs/splotch-photo-permission.xml';BACKUP='/data/local/tmp/config-sweep-photo-pref.xml'
adb('push',str(ROOT/'repro'/'locale-helper'/'classes.dex'),'/data/local/tmp/config-sweep-permission.dex')
flag_command='CLASSPATH=/data/local/tmp/config-sweep-permission.dex app_process /system/bin QaPermissionFlags'
flags=[json.loads(line) for line in rootsh(flag_command).splitlines() if line.startswith('{')]
(OUT/'save-permission-before.json').write_text(json.dumps(flags,indent=2)+'\n')
pref=rootsh(f'test ! -e {BACKUP} && if test -f {PREF}; then cp -a {PREF} {BACKUP}; echo present; else echo absent; fi')
assert pref in ['present','absent'],pref
(OUT/'save-pref-baseline.txt').write_text(pref)
def files():
 text=sh(f'for p in /sdcard/Pictures/Splotch /sdcard/Android/media/{PKG}/Splotch; do if test -d "$p"; then find "$p" -maxdepth 1 -type f; fi; done')
 return set(text.splitlines()) if text else set()
media='content query --uri content://media/external/images/media --projection _id:_data:_display_name:mime_type'
(OUT/'save-media-before.txt').write_text(sh(media));before=files()
snapshot('save-font-before');sh('settings put system font_scale 2.0');snapshot('save-font-applied')
labels=[n.get('content-desc') for n in nodes(LAST_XML) if n.get('content-desc','').startswith('Save')]
assert len(labels)==1,labels;tap(labels[0],LAST_XML);time.sleep(1)
for attempt in range(20):
 focus=sh('dumpsys window windows')
 if 'GrantPermissionsActivity' in focus or files()!=before:break
 time.sleep(.3)
if re.search(r'mCurrentFocus=.*packageinstaller.*GrantPermissionsActivity',focus):
 snapshot('save-permission-prompt')
 assert 'Splotch' in LAST_XML and ('photos' in LAST_XML or 'storage' in LAST_XML), 'Wrong permission request'
 allow=next(n for n in nodes(LAST_XML) if n.get('resource-id','').endswith(':id/permission_allow_button'))
 b=list(map(int,re.findall(r'\d+',allow['bounds'])));sh(f'input tap {(b[0]+b[2])//2} {(b[1]+b[3])//2}')
time.sleep(3);foreground();snapshot('save-returned')
created=sorted(files()-before);assert len(created)==1,created
bytes=adb('exec-out','cat',created[0],binary=True);assert bytes.startswith(b'\x89PNG\r\n\x1a\n')
(OUT/'saved-after-font.png').write_bytes(bytes)
media_after=sh(media)
for attempt in range(10):
 if pathlib.PurePosixPath(created[0]).name in media_after:break
 time.sleep(.5);media_after=sh(media)
assert pathlib.PurePosixPath(created[0]).name in media_after,'Saved file not published to MediaStore'
(OUT/'save-media-after.txt').write_text(media_after)
metadata={'serial':SERIAL,'apiLevel':28,'remoteFile':created[0],'bytes':len(bytes),'mediaStorePublished':True,'permissionBefore':flags,'prefBefore':pref,'fontScale':'2.0','evidence':'saved-after-font.png'}
(OUT/'save-result.json').write_text(json.dumps(metadata,indent=2)+'\n')
value=orig['settings']['system']['font_scale'];sh('settings delete system font_scale' if value=='null' else 'settings put system font_scale '+value)
snapshot('save-font-restored');undo('save-font-restored')
print(json.dumps(metadata),flush=True)
