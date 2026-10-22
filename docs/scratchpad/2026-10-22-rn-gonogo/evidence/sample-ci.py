import subprocess,json,pathlib,datetime,statistics
out=pathlib.Path('/workspace/rn-desk/docs/scratchpad/2026-10-22-rn-gonogo/evidence')
commands=[]
def gh(args):
 commands.append('gh '+' '.join(args))
 return json.loads(subprocess.check_output(['gh',*args],text=True))
runs=gh(['run','list','--repo','KyleMit/Splotch','--workflow','285690264','--limit','500','--json','databaseId,headSha,headBranch,createdAt,startedAt,updatedAt,conclusion,status,url'])
older=gh(['run','list','--repo','KyleMit/Splotch','--workflow','285690264','--created','<2026-10-07','--limit','500','--json','databaseId,headSha,headBranch,createdAt,startedAt,updatedAt,conclusion,status,url'])
runs+=older
result={}
for branch in ['main','codex/native-migration']:
 prs=gh(['pr','list','--repo','KyleMit/Splotch','--base',branch,'--state','merged','--limit','25','--json','number,headRefOid,headRefName,mergedAt,url'])
 selected=[]
 for pr in prs:
  choices=[r for r in runs if r['headSha']==pr['headRefOid'] and r['status']=='completed' and r['conclusion'] in ['success','failure']]
  if not choices:continue
  run=max(choices,key=lambda r:r['databaseId'])
  seconds=(datetime.datetime.fromisoformat(run['updatedAt'].replace('Z','+00:00'))-datetime.datetime.fromisoformat(run['startedAt'].replace('Z','+00:00'))).total_seconds()
  selected.append(dict(pr=pr,run=run,seconds=seconds))
  if len(selected)==10:break
 result[branch]=dict(samples=selected,count=len(selected),median_seconds=statistics.median(s['seconds'] for s in selected) if selected else None)
(out/'ci-samples.json').write_text(json.dumps(dict(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),result=result,runs=runs),indent=2)+'\n')
(out/'ci-sampling.log.txt').write_text('Tool gh 2.46.0 + Python 3.12.14; run count 1 per command\nRead-only remote history; no candidate execution\n'+'\n'.join(commands)+'\nOutput ci-samples.json\n'+json.dumps({b:{k:v for k,v in r.items() if k!='samples'} for b,r in result.items()},indent=2)+'\n')
print({b:{k:v for k,v in r.items() if k!='samples'} for b,r in result.items()})
