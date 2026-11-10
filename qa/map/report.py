#!/usr/bin/env python3
"""Build submission/map-lab/index.html from the real run outputs (matrix, learner matrix, learned model)."""
import json, re, pathlib
qa = pathlib.Path(__file__).resolve().parents[1]; root = qa.parent
pool = dict(re.findall(r"^\s+(MAP\d+|none): '((?:[^'\\]|\\.)*)',", (qa / 'blind/saboteur.ts').read_text(), re.M))
expect = {k: v.split("', '") for k, v in re.findall(r"(MAP\d+): \['([^\]]*)'\]", (qa / 'hub/hub.ts').read_text())}
def jl(p):
    f = qa / 'map/out' / p
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []
rows = {}
# Oldest first, newest wins: first full matrix, the re-run, then one-command trials.
for src in ('matrix.v1.jsonl', 'matrix.jsonl'):
    for r in jl(src):
        v = r.get('verdict') or {}
        if v: rows[r['id']] = {'id': r['id'], 'desc': pool.get(r['id'], ''), 'failures': v.get('failures', []), 'findings': v.get('findings', [])}
for r in jl('trials.jsonl'):
    rows[r['id']] = {'id': r['id'], 'desc': pool.get(r['id'], ''), 'failures': r.get('failures', []), 'findings': r.get('findings', [])}
expect['MAP03'] = ['G8', 'G15']
order = sorted(rows, key=lambda k: -1 if k == 'none' else int(k[3:]))
learner = []
for r in jl('learner-matrix.jsonl'):
    res = r.get('result') or {}; rej = res.get('event') == 'rejected'
    learner.append({'id': r['id'], 'desc': pool.get(r['id'], ''), 'rejected': rej, 'reasons': res.get('reasons', []), 'ok': rej == (r['id'] != 'none') and bool(res)})
data = {'matrix': [rows[k] for k in order], 'learner': learner, 'expect': expect, 'model': json.loads((qa / 'map/out/map-model.json').read_text())}
tpl = (root / 'submission/map-lab/template.html').read_text()
out = root / 'submission/map-lab/index.html'
out.write_text(tpl.replace('/*DATA*/null', json.dumps(data).replace('</', '<\\/')))
print(out, len(data['matrix']), 'builds', len(learner), 'learner runs')
