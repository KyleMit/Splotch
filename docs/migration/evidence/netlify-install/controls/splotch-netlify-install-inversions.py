import pathlib,subprocess,os,json,hashlib,time
root=pathlib.Path('/Users/kylemit/.codex/worktrees/migration-netlify-install/Splotch')
env=dict(os.environ,PATH='/Users/kylemit/.nvm/versions/node/v22.23.2/bin:/Users/kylemit/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
paths=['netlify.toml','tools/netlify-production-install.mjs'];original={p:(root/p).read_bytes() for p in paths};results=[]
cases=[('actual-old-netlify-command','netlify.toml',lambda s:s.replace('node tools/netlify-production-install.mjs && ','',1),'gates the actual Netlify'),('missing-project-prepare-stages','tools/netlify-production-install.mjs',lambda s:s.replace("  'preprepare',\n",'',1).replace("  'postprepare',\n",'',1),'before any manager child'),('missing-modules-dir-qualification','tools/netlify-production-install.mjs',lambda s:s.replace("  'modules-dir',\n",'',1),'explicit JSON string undefined')]
for label,path,mutate,title in cases:
 target=root/path;before=original[path];source=mutate(before.decode());assert source.encode()!=before,label
 try:
  target.write_text(source);log=pathlib.Path('/private/tmp/splotch-netlify-install-inversion-'+label+'.log.txt');start=time.monotonic()
  with log.open('w') as output:child=subprocess.run(['npm','run','test:tools','--','tests/netlify-production-install.test.mjs','--maxWorkers=1','-t',title],cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT)
  text=log.read_text();assert child.returncode!=0 and 'FAIL ' in text and 'AssertionError' in text and 'Test Files' in text,(label,child.returncode,text[-3000:])
  results.append({'inversion':label,'changedPath':path,'selectedTitle':title,'exitCode':child.returncode,'durationSeconds':time.monotonic()-start,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'specificTestAssertionFailed':True});print(json.dumps(results[-1]),flush=True)
 finally:
  target.write_bytes(before);assert target.read_bytes()==before
for path,before in original.items():assert (root/path).read_bytes()==before
pathlib.Path('/private/tmp/splotch-netlify-install-inversions-receipt.json').write_text(json.dumps({'status':'passed','actualSourcesRestored':True,'inversions':results},indent=2)+'\n')
log=pathlib.Path('/private/tmp/splotch-netlify-install-node24-focused.log.txt')
with log.open('w') as output:child=subprocess.run(['/Users/kylemit/.nvm/versions/node/v24.16.0/bin/node','node_modules/vitest/vitest.mjs','run','--config','tools/vitest.config.mjs','tests/netlify-production-install.test.mjs','--maxWorkers=1'],cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT)
assert child.returncode==0,log
print(json.dumps({'node24FocusedExit':child.returncode,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}),flush=True)
