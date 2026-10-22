"""Read-only tracked-source, lock-graph and ledger census; Python 3 + PyYAML."""
import collections,csv,json,pathlib,re,subprocess,sys,yaml

def base_key(name,version):
 return name+'@'+version.split('(')[0]

def measure(path):
 root=pathlib.Path(path)
 files=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')[:-1]
 groups=collections.defaultdict(lambda:dict(files=0,lines=0,dependency_lock_lines=0,bytes=0))
 extensions={'.js','.jsx','.ts','.tsx','.mjs','.cjs','.css','.html','.svelte','.json','.yaml','.yml','.md','.txt','.py','.sh','.swift','.kt','.java','.gradle','.xml','.rb','.toml','.sql','.csv','.patch','.m','.mm','.resolved','.h','.cpp','.plist','.properties','.xcconfig','.pbxproj','.lock'}
 for name in files:
  f=root/name
  if not f.is_file(): continue
  data=f.read_bytes()
  test=bool(re.search(r'(^|/)(tests?|__tests__|e2e)(/|$)|\.(test|spec)\.',name))
  if name.startswith(('docs/','scrapbook/')): group='docs/evidence'
  elif test: group='tests'
  elif name.startswith(('src/','web/src/','netlify/','experiments/native-architecture/src/')): group='app'
  elif name.startswith(('android/','ios/')): group='native-project'
  elif name.startswith(('tools/','.github/','.ruler/','.agents/','.claude/','.codex/','scripts/')): group='tooling/agent'
  else: group='other/assets/config'
  groups[group]['files']+=1; groups[group]['bytes']+=len(data)
  if (f.suffix in extensions or f.name in ('Podfile','Gemfile')) and b'\0' not in data:
   groups[group]['lines']+=len(data.splitlines())
   if f.name in ('Podfile.lock','Package.resolved','Gemfile.lock','pnpm-lock.yaml','uv.lock'):
    groups[group]['dependency_lock_lines']+=len(data.splitlines())
 lock=yaml.safe_load((root/'pnpm-lock.yaml').read_text()); snaps=lock['snapshots']
 seen=set(); missing=set(); direct=set(); roots={}
 for importer,info in lock['importers'].items():
  for kind in ('dependencies','optionalDependencies'):
   for name,item in info.get(kind,{}).items(): roots[name]=item['version'];direct.add(base_key(name,item['version']))
 pending=[n+'@'+v for n,v in roots.items()]
 while pending:
  key=pending.pop()
  if key in seen: continue
  if key not in snaps: missing.add(key); continue
  seen.add(key)
  for kind in ('dependencies','optionalDependencies'):
   for name,version in snaps[key].get(kind,{}).items(): pending.append(name+'@'+str(version))
 identities={k.split('(')[0] for k in seen}
 patches=[dict(file=n,bytes=(root/n).stat().st_size,lines=len((root/n).read_text().splitlines())) for n in files if n.startswith('patches/')]
 pods=root/'ios/Podfile.lock'
 native={}
 if pods.exists():
  pod=yaml.safe_load(pods.read_text()); names=[next(iter(p)) if isinstance(p,dict) else p for p in pod['PODS']]
  native['pods_entries']=len(names); native['pod_root_names']=len({n.split(' ')[0].split('/')[0] for n in names});native['pods_direct']=len(pod['DEPENDENCIES']);native['cocoapods']=pod['COCOAPODS']
 native['spm']=[]
 for n in files:
  if n.endswith('Package.resolved'):
   native['spm'].append(dict(file=n,pins=json.loads((root/n).read_text()).get('pins',[])))
 native['gradle_declarations']={n:[s.strip() for s in (root/n).read_text().splitlines() if re.search(r'^\s*(implementation|api|compileOnly|runtimeOnly|classpath)\s*[( ]',s)] for n in files if n.endswith('.gradle') and n.startswith('android/')}
 for group in groups.values(): group['nonlock_lines']=group['lines']-group['dependency_lock_lines']
 print(json.dumps(dict(path=path,commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),groups=groups,runtime=dict(direct=len(roots),reachable_name_versions=len(identities),transitive_name_versions=len(identities-direct),peer_snapshots=len(seen),unresolved=sorted(missing),direct_pins=roots,dot_zero=[k for k in sorted(identities) if re.search(r'\d+\.\d+\.0$',k)]),patches=patches,patch_totals=dict(files=len(patches),bytes=sum(p['bytes'] for p in patches),lines=sum(p['lines'] for p in patches)),native=native),indent=2))

def ledgers(path):
 root=pathlib.Path(path)
 for name in ['docs/scratchpad/2026-10-14-rn-parity-ledger/logic-ledger.csv','docs/scratchpad/2026-10-14-rn-parity-ledger/behaviour-inventory.csv','docs/scratchpad/2026-10-14-rn-parity-ledger/shipping-e2e-behaviours.csv','docs/scratchpad/2026-10-18-device-parity/protocol-mapping.csv','docs/scratchpad/2026-10-18-device-parity/requirements.csv','docs/scratchpad/2026-10-18-device-parity/acceptance-subcells.csv']:
  rows=list(csv.DictReader((root/name).open()))
  fields=[c for c in ['status','classification','class','evidence','differ','likely'] if c in rows[0]]
  print(json.dumps(dict(file=name,rows=len(rows),counts={c:dict(collections.Counter(r[c] for r in rows)) for c in fields}),indent=2))
if __name__=='__main__':
 if sys.argv[1]=='--ledgers': ledgers(sys.argv[2])
 else: measure(sys.argv[1])
