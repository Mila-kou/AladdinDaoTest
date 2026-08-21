#!/usr/bin/env python3
"""把 TestCode/artifacts 里「可核验最小集」复制进受版本管理的 TestCode/evidence-archive/<batch>/：
- run-batches/*/run.json（批次摘要，全部）
- 每条 latest PASS 场景所属 run 的 results.json + summary.md + attachments/*evidence.json
- manifest.json：场景→run id / executedAt / release / env / mode / 覆盖 / tx 数 / 首末 txHash+块号 / sha256
用法：python3 archive-evidence.py <archive-name>（在 TestCode 目录下执行）
"""
import json, glob, os, sys, shutil, hashlib, datetime
name = sys.argv[1]
root = os.path.abspath('.')
assert os.path.basename(root) == 'TestCode', root
dst = os.path.join(root, 'evidence-archive', name)
os.makedirs(dst, exist_ok=True)
latest = json.load(open('artifacts/latest/results.json'))
want = {(r['id'], r['project']): r for r in latest['results'] if r['status'] == 'PASS'}
def sha(p):
    h = hashlib.sha256(); h.update(open(p, 'rb').read()); return h.hexdigest()
def cp(src):
    rel = os.path.relpath(src, 'artifacts'); out = os.path.join(dst, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True); shutil.copy2(src, out); return rel, sha(out)
manifest = {'archivedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'latestRun': latest['run'], 'scenarios': [], 'files': []}
for rj in sorted(glob.glob('artifacts/run-batches/*/run.json')):
    manifest['files'].append(dict(zip(('path', 'sha256'), cp(rj))))
seen_runs = set()
for (sid, proj), r in sorted(want.items()):
    hit = None
    for rd in sorted(glob.glob('artifacts/runs/*/results.json')):
        try: d = json.load(open(rd))
        except Exception: continue
        for rr in d.get('results', []):
            if rr['id'] == sid and rr.get('project') == proj and rr.get('executedAt') == r['executedAt'] and rr.get('status') == 'PASS':
                hit = (os.path.dirname(rd), d); break
        if hit: break
    if not hit:
        manifest['scenarios'].append({'id': sid, 'project': proj, 'executedAt': r['executedAt'], 'run': None, 'note': '未在 artifacts/runs 找到同 executedAt 的 PASS 记录'}); continue
    rdir, d = hit; rid = os.path.basename(rdir)
    ee = r.get('executionEvidence') or {}
    txs = [t for t in (ee.get('transactions') or []) if t.get('status') == 'SUCCESS']
    files = []
    if rid not in seen_runs:
        seen_runs.add(rid)
        for f in ['results.json', 'summary.md']:
            p = os.path.join(rdir, f)
            if os.path.exists(p): files.append(dict(zip(('path', 'sha256'), cp(p))))
        for p in sorted(glob.glob(os.path.join(rdir, 'attachments', '*evidence.json'))):
            files.append(dict(zip(('path', 'sha256'), cp(p))))
        manifest['files'].extend(files)
    manifest['scenarios'].append({
        'id': sid, 'project': proj, 'status': r['status'], 'executedAt': r['executedAt'], 'run': rid,
        'release': d.get('run', {}).get('release'), 'mode': ee.get('mode'), 'coverageStatus': ee.get('coverageStatus'),
        'coverageNote': ee.get('coverageNote'), 'reconciliations': len(ee.get('reconciliations') or []),
        'transactions': len(txs),
        'firstTx': {'hash': txs[0]['txHash'], 'block': txs[0].get('blockNumber')} if txs else None,
        'lastTx': {'hash': txs[-1]['txHash'], 'block': txs[-1].get('blockNumber')} if txs else None,
        'evidenceFiles': [f['path'] for f in files if f['path'].endswith('evidence.json')],
    })
json.dump(manifest, open(os.path.join(dst, 'manifest.json'), 'w'), ensure_ascii=False, indent=2)
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(dst) for f in fs)
print(f'archived {len(manifest["scenarios"])} scenarios, {len(manifest["files"])} files, {total/1e6:.1f} MB -> {dst}')
