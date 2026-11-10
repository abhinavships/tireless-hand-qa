from pathlib import Path
import json,shutil
root=Path(__file__).resolve().parents[2]
dst=root/'evidence/S09/clean';backup=root/'qa/mutations/staging/s09-before-clean'
runs=json.loads((dst/'runs.json').read_text())
for row in json.loads((backup/'runs.json').read_text()):
 if 'dashboard' not in row.get('title',''): continue
 names=[]
 for name in row.get('artifacts',[]):
  src=backup/name
  if src.is_file():
   target='baseline-'+name;shutil.copy2(src,dst/target);names.append(target)
 row['artifacts']=names;row['baselineFinding']='F3';runs.append(row)
(dst/'runs.json').write_text(json.dumps(runs,indent=2)+'\n')
failed=next((r for r in runs if r['status'] not in ['passed','skipped']),None)
verdict={'scenario':'S09','project':','.join(sorted({r['project'] for r in runs})),'label':'clean','status':failed['status'] if failed else 'passed','message':(failed.get('message','').strip().splitlines() or [''])[0][:200] if failed else '', 'duration':sum(r['duration'] for r in runs)}
(dst/'verdict.json').write_text(json.dumps(verdict,indent=2)+'\n')
print(f'S09 clean merged: {len(runs)} entries; dashboard findings preserved')
shutil.rmtree(backup)
