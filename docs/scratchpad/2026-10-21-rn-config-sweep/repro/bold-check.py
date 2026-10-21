import sys,pathlib,time
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1]
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
snapshot('bold-recheck-before');sh('settings put secure font_weight_adjustment 300');snapshot('bold-recheck-applied')
tap('Undo',LAST_XML);time.sleep(5);snapshot('bold-recheck-applied-undo')
sh('input swipe 650 900 650 700 500')
sh('settings put secure font_weight_adjustment 0');sh('settings delete secure font_weight_adjustment');snapshot('bold-recheck-restored');undo('bold-recheck-restored')
