import pathlib,sys,re,time
p=pathlib.Path(__file__).with_name('sweep.py');serial=sys.argv[1]
sys.argv=[str(p),serial,'library'];exec(compile(p.read_text(),str(p),'exec'))
focus=sh('dumpsys window windows' if SERIAL=='emulator-5686' else 'dumpsys window displays')
if re.search(r'mCurrentFocus=.*ImmersiveModeConfirmation',focus):
 snapshot('initial-system-prompt')
 button=next(n for n in nodes(LAST_XML) if n.get('text','').lower() in ['got it','ok'])
 b=list(map(int,re.findall(r'\d+',button['bounds'])));sh(f'input tap {(b[0]+b[2])//2} {(b[1]+b[3])//2}');time.sleep(1.5)
foreground()
