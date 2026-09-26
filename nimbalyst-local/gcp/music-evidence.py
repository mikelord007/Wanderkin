import json, os
root = '/mnt/data/objectquest'

def load(name):
    p = os.path.join(root, name)
    if not os.path.exists(p):
        print('MISSING', name); return None
    return json.load(open(p))

levels = load('levels.json')
jobs = load('jobs.json') or {}
job_list = [v.get('job', v) for v in (jobs.values() if isinstance(jobs, dict) else jobs)]

def items(d):
    if d is None: return []
    if isinstance(d, list): return d
    inner = d.get('levels') or d.get('items') or d.get('records')
    if isinstance(inner, dict): return list(inner.values())
    if isinstance(inner, list): return inner
    return [v for v in d.values() if isinstance(v, dict)]

lv = items(levels)
print('levels:', len(lv))
for L in lv:
    m = L.get('manifest') or L
    wf = m.get('workflow') or {}
    print('--- level', L.get('id') or m.get('id'), '| title:', m.get('title') or m.get('name'), '| updated:', L.get('updatedAt') or m.get('updatedAt'))
    print('    media field present:', 'media' in m, '| media.audio:', json.dumps((m.get('media') or {}).get('audio'))[:300] if m.get('media') else None)
    print('    workflow keys:', sorted(wf.keys()) if isinstance(wf, dict) else type(wf).__name__)
    for j in (wf.get('jobs') or []):
        print('    workflow job:', json.dumps({k: j.get(k) for k in ('kind', 'jobId', 'status', 'state', 'purpose')}))
    sel = wf.get('selectedReference') or {}
    print('    atmosphere:', json.dumps((sel.get('atmosphere') if isinstance(sel, dict) else None))[:200])
    print('    biome:', json.dumps(m.get('biome')))
print('=== music jobs ===')
for j in job_list:
    req = j.get('request') or {}
    if j.get('kind') == 'music' or req.get('purpose') == 'world-soundtrack':
        res = j.get('result') or {}
        asset = res.get('asset') or {}
        print(json.dumps({'id': j.get('id'), 'state': j.get('state'), 'createdAt': j.get('createdAt'), 'idempotencyKey': j.get('idempotencyKey'), 'prompt': req.get('prompt'), 'durationSeconds': req.get('durationSeconds'), 'instrumental': req.get('instrumental'), 'resultAssetId': j.get('resultAssetId'), 'asset.url': asset.get('url'), 'result_keys': sorted(res.keys()) if isinstance(res, dict) else None})[:900])
