import pathlib,sys,time,json,re
p=pathlib.Path(__file__).with_name('sweep.py');sys.argv=[str(p),'emulator-5686','library'];exec(compile(p.read_text(),str(p),'exec'))
orig=json.loads((OUT/'original-settings.json').read_text())
def files():
 v=sh(f'for p in /sdcard/Pictures/Splotch /sdcard/Android/media/{PKG}/Splotch; do if test -d "$p"; then find "$p" -maxdepth 1 -type f; fi; done')
 return set(v.splitlines()) if v else set()
before=files();focus=sh('dumpsys window windows');assert re.search(r'mCurrentFocus=.*packageinstaller.*GrantPermissionsActivity',focus)
snapshot('save-permission-prompt');assert 'Splotch' in LAST_XML
allow=next(n for n in nodes(LAST_XML) if n.get('resource-id','').endswith(':id/permission_allow_button'))
b=list(map(int,re.findall(r'\d+',allow['bounds'])));sh(f'input tap {(b[0]+b[2])//2} {(b[1]+b[3])//2}')
for attempt in range(30):
 focus=sh('dumpsys window windows')
 if re.search(r'mCurrentFocus=.*'+re.escape(PKG),focus):break
 time.sleep(.3)
foreground();time.sleep(3);snapshot('save-returned')
created=sorted(files()-before);assert len(created)==1,created
png=adb('exec-out','cat',created[0],binary=True);assert png.startswith(b'\x89PNG\r\n\x1a\n');(OUT/'saved-after-font.png').write_bytes(png)
media='content query --uri content://media/external/images/media --projection _id:_data:_display_name:mime_type'
for attempt in range(20):
 rows=sh(media)
 if pathlib.PurePosixPath(created[0]).name in rows:break
 time.sleep(.5)
assert pathlib.PurePosixPath(created[0]).name in rows;(OUT/'save-media-after.txt').write_text(rows)
meta={'serial':SERIAL,'apiLevel':28,'remoteFile':created[0],'bytes':len(png),'mediaStorePublished':True,'fontScale':'2.0','evidence':'saved-after-font.png','permissionBefore':json.loads((OUT/'save-permission-before.json').read_text()),'prefBefore':(OUT/'save-pref-baseline.txt').read_text(),'resumedPendingPermissionPrompt':True}
(OUT/'save-result.json').write_text(json.dumps(meta,indent=2)+'\n')
v=orig['settings']['system']['font_scale'];sh('settings delete system font_scale' if v=='null' else 'settings put system font_scale '+v)
snapshot('save-font-restored');undo('save-font-restored');print(json.dumps(meta),flush=True)
