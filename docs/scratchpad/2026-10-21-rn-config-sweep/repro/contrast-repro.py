import pathlib,sys,time
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1]
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
for attempt in [1,2]:
 label=f'contrast-fresh-{attempt}'
 sh('settings delete secure high_text_contrast_enabled')
 sh('am force-stop '+PKG);launch();time.sleep(1);draw();snapshot(label+'-before')
 sh('settings put secure high_text_contrast_enabled 1');time.sleep(5)
 snapshot(label+'-applied');time.sleep(3);snapshot(label+'-waited')
 undo(label+'-applied')
 sh('settings delete secure high_text_contrast_enabled');snapshot(label+'-restored')
