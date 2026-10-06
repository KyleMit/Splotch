import os,pathlib,tempfile,subprocess,tarfile,io,json,hashlib,time,shutil
source=pathlib.Path('/Users/kylemit/.codex/worktrees/migration-netlify-install/Splotch')
base='423769b486d81a8da0cdd1c1e6abfedc31bec757'
packet=pathlib.Path(tempfile.mkdtemp(prefix='splotch-netlify-install-real-controls-',dir='/private/tmp')).resolve()
root=packet/'checkout';root.mkdir()
env=dict(os.environ,PATH='/Users/kylemit/.nvm/versions/node/v22.23.2/bin:/Users/kylemit/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',PNPM_FLAGS='--prod',COREPACK_ENABLE_NETWORK='0')
rows=[]
receipt=pathlib.Path('/private/tmp/splotch-netlify-install-real-controls-receipt.json')
source_paths=['netlify.toml','knip.production.json','.github/workflows/native-topology-proof.yml','tools/lib/netlify-runtime.mjs','tools/netlify-production-install.mjs','tools/tests/netlify-production-install.test.mjs','tools/netlify-topology-witness.mjs','tools/migration/gen-topology-proof-inputs.mjs','tools/migration/check-native-topology-evidence.mjs','docs/migration/evidence/netlify-install/production-install-contract.json']
source_rows=[]
def record():
 receipt.write_text(json.dumps({'status':'running','root':str(root),'packet':str(packet),'sourceBase':base,'sourceRows':source_rows,'scope':'Local controlled source archive plus current overlays; synthetic named-proof facts are not actual Netlify evidence','steps':rows},indent=2)+'\n')
def run(label,argv,expect=0,extra=None):
 log=packet/(label+'.log.txt');start=time.monotonic()
 with log.open('w') as out:result=subprocess.run(argv,cwd=root,env=env| (extra or {}),stdout=out,stderr=subprocess.STDOUT)
 row={'step':label,'argv':argv,'exitCode':result.returncode,'durationSeconds':time.monotonic()-start,'log':str(log),'logBytes':log.stat().st_size,'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()};rows.append(row);record();print(json.dumps(row),flush=True)
 assert (result.returncode==0 if expect==0 else result.returncode!=0),(label,result.returncode)
 return log.read_text()
def put(path,contents):
 target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(contents) if isinstance(contents,dict) else contents)
def inspect(label,expect=0):
 script='''import{readFileSync}from'node:fs';import{join}from'node:path';const root=process.cwd();const{inspectNetlifyProductionInstall}=await import(new URL('file://'+root+'/tools/netlify-topology-witness.mjs'));const contract=JSON.parse(readFileSync(join(root,'docs/migration/evidence/netlify-install/production-install-contract.json'),'utf8'));const env={BRANCH:'feature/netlify-migration-topology-05',NETLIFY:'true',CONTEXT:'branch-deploy',COMMIT_REF:'''+json.dumps(base)+''',PNPM_FLAGS:'--prod'};console.log(JSON.stringify(inspectNetlifyProductionInstall(root,contract,{env,headSha:env.COMMIT_REF,nodeVersion:process.version,packageManagerVersion:'11.22.0'})));'''
 return run(label,['node','--input-type=module','--eval',script],expect)
archive=subprocess.run(['git','archive','--format=tar',base],cwd=source,check=True,stdout=subprocess.PIPE).stdout
with tarfile.open(fileobj=io.BytesIO(archive)) as stream:stream.extractall(root,filter='data')
for path in source_paths:
 target=root/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/path,target);b=target.read_bytes();source_rows.append({'path':path,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
record();print(json.dumps({'packet':str(packet),'sourcePaths':len(source_rows)}),flush=True)
run('development-baseline',['pnpm','install','--frozen-lockfile'])
stale='node_modules/filelist/node_modules/brace-expansion/package.json'
put(stale,{'name':'brace-expansion','version':'2.1.1'})
run('cached-platform-like-prod',['pnpm','install','--frozen-lockfile','--prod'])
assert (root/stale).is_file(),'Normal prod install unexpectedly removed seeded stale leaf'
text=inspect('cached-production-witness-refusal',1);assert 'brace-expansion@2.1.1' in text,text[-2000:]
run('force-prod-control',['pnpm','install','--frozen-lockfile','--prod','--force'])
assert (root/stale).is_file(),'Force removed seeded stale leaf; source assumption needs revision'
text=inspect('force-production-witness-refusal',1);assert 'brace-expansion@2.1.1' in text,text[-2000:]
run('prune-prod-control',['pnpm','prune','--prod'])
assert (root/stale).is_file(),'Prune removed seeded stale leaf; source assumption needs revision'
text=inspect('prune-production-witness-refusal',1);assert 'brace-expansion@2.1.1' in text,text[-2000:]
put('node_modules/.pnpm/splotch-stale-store/node_modules/splotch-stale-store/package.json',{'name':'splotch-stale-store','version':'1.0.0'})
put('experiments/native-architecture/node_modules/splotch-stale-candidate/package.json',{'name':'splotch-stale-candidate','version':'1.0.0'})
outside=packet/'outside-sentinel';outside.mkdir();(outside/'sentinel').write_text('untouched')
(root/'node_modules/splotch-linked-cache-leaf').symlink_to(outside,target_is_directory=True)
run('qualified-warm-ci',['node','tools/netlify-production-install.mjs'])
for path in [stale,'node_modules/.pnpm/splotch-stale-store','experiments/native-architecture/node_modules/splotch-stale-candidate','node_modules/splotch-linked-cache-leaf']:assert not (root/path).exists(),path
assert (outside/'sentinel').read_text()=='untouched'
inspect('qualified-warm-full-witness')
for context in ['web','netlify/functions','tools']:
 path=f'{context}/node_modules/splotch-nonworkspace-survivor';put(path+'/package.json',{'name':'splotch-nonworkspace-survivor','version':'1.0.0'})
 run('nonworkspace-ci-'+context.replace('/','-'),['node','tools/netlify-production-install.mjs'])
 assert (root/path/'package.json').is_file(),context
 text=inspect('nonworkspace-refusal-'+context.replace('/','-'),1);assert 'splotch-nonworkspace-survivor@1.0.0' in text,text[-2000:]
 shutil.rmtree(root/path)
contract=json.loads((root/'docs/migration/evidence/netlify-install/production-install-contract.json').read_text())
exclusive_names={r['name'] for r in contract['candidateExclusiveArtifacts']}
shared=next(r for r in contract['productionArtifacts'] if r['name'] in exclusive_names)
shared_path='experiments/native-architecture/node_modules/'+shared['name']
put(shared_path+'/package.json',{'name':shared['name'],'version':shared['version']})
inspect('shared-production-version-positive');shutil.rmtree(root/shared_path)
put('undefined/sentinel','untouched')
text=run('explicit-string-undefined-refusal',['node','tools/netlify-production-install.mjs'],1,{'pnpm_config_modules_dir':'undefined'})
assert 'Unsupported explicit pnpm setting modules-dir' in text and 'second-production-install-start' not in text
assert (root/'undefined/sentinel').read_text()=='untouched'
modules=root/'node_modules';moved=packet/'module-tree-before-alias';modules.rename(moved);modules.symlink_to(outside,target_is_directory=True)
try:
 text=run('module-root-alias-refusal',['node','tools/netlify-production-install.mjs'],1)
 assert 'Unsafe installer root or source kind' in text and 'second-production-install-start' not in text
 assert (outside/'sentinel').read_text()=='untouched'
finally:modules.unlink();moved.rename(modules)
shutil.rmtree(root/'node_modules');candidate_modules=root/'experiments/native-architecture/node_modules'
if candidate_modules.exists():shutil.rmtree(candidate_modules)
run('qualified-cold-ci',['node','tools/netlify-production-install.mjs']);inspect('qualified-cold-full-witness')
for path in source_rows:assert hashlib.sha256((root/path['path']).read_bytes()).hexdigest()==path['sha256'],path['path']
run('qualified-production-release-build',['npm','run','build'])
manifest_path=root/'package.json';original=manifest_path.read_bytes();manifest=json.loads(original);manifest['dependencies']['splotch-intentional-lock-mismatch']='1.0.0';manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
try:
 continuation="node tools/netlify-production-install.mjs && node -e 'require(\"node:fs\").writeFileSync(\"build-continuation\",\"ran\")'"
 text=run('failed-frozen-install-no-build',['/bin/sh','-c',continuation],1)
 assert 'ERR_PNPM_OUTDATED_LOCKFILE' in text and 'second-production-install-exit' in text and 'second-production-install-accepted' not in text
 assert not (root/'build-continuation').exists()
finally:manifest_path.write_bytes(original)
d=json.loads(receipt.read_text());d['status']='passed';d['sharedPositiveArtifact']=shared;d['outsideSentinelUnchanged']=True;d['sourceOwnersUnchanged']=True;d['knownLimit']='pnpm clean empties module trees before a failed frozen install; rollback is not claimed';receipt.write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'status':'passed','steps':len(rows),'packet':str(packet)}),flush=True)
