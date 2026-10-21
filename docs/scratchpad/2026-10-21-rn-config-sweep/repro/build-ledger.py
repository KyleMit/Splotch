import pathlib,json,collections
root=pathlib.Path(__file__).resolve().parents[1]
base=['font-largest','font-smallest','density-larger','density-smaller','night-on','night-off','contrast-on','bold-on','app-locale-fr','app-locale-ar','system-locale-fr-FR','system-locale-ar','rotation-landscape','rotation-portrait','navigation-threebutton','navigation-gestural','hardware-keyboard','memory-trim','process-death','split-screen','freeform']
rows=[]
for serial,api in [('emulator-5688',34),('emulator-5690',36),('emulator-5686',28)]:
 cases=base.copy();na=[]
 if api==28:
  na=['bold-on','app-locale-fr','app-locale-ar','navigation-threebutton','navigation-gestural'];cases=[x for x in cases if x not in na]+['save-after-font']
 for case in cases:
  status='pass';finding=None
  if case=='contrast-on':status='fail';finding='RN-CONFIG-001'
  elif case=='split-screen' and api==34:status='fail';finding='RN-CONFIG-002'
  elif case in ['app-locale-ar','system-locale-ar']:status='known-issue';finding='3140'
  elif case=='freeform':status='blocked'
  rows.append({'serial':serial,'apiLevel':api,'case':case,'status':status,'finding':finding})
 for case in na:rows.append({'serial':serial,'apiLevel':api,'case':case,'status':'not-applicable','finding':None})
counts={serial:dict(collections.Counter(r['status'] for r in rows if r['serial']==serial)) for serial in ['emulator-5688','emulator-5690','emulator-5686']}
report={'counting':'One case per listed change/flow; apply and restoration form one case, repeats/diagnostics excluded. Not-applicable rows excluded from executed counts.','cases':rows,'perDevice':counts,'totals':dict(collections.Counter(r['status'] for r in rows))}
(root/'results/case-ledger.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(counts))
