#!/bin/bash
# Read-only inspection of the live API: recent log lines and job records.
echo "--- non-info log lines (4h) ---"
sudo docker logs --since 4h wanderkin-api 2>&1 | grep -ivE 'listening|^> |^\s*$' | tail -30
echo "--- job records on disk ---"
sudo python3 - <<'PY'
import json
d = json.load(open('/mnt/data/objectquest/jobs.json'))
print('top-level type:', type(d).__name__)
if isinstance(d, dict):
    print('top-level keys:', list(d.keys())[:8])
    items = d.get('jobs') or d.get('items') or d.get('records')
    if isinstance(items, dict):
        items = list(items.values())
    if items is None:
        items = list(d.values())
else:
    items = d
items = [i for i in items if isinstance(i, dict)]
items = [i.get('job', i) for i in items]
print(len(items), 'job records')
if items:
    print('job keys:', sorted(items[0].keys()))
    print('sample:', json.dumps({k: v for k, v in items[0].items() if k not in ('result', 'request')})[:600])
    print('sample request:', json.dumps(items[0].get('request'))[:400])
def g(o, *path):
    for p in path:
        if not isinstance(o, dict):
            return None
        o = o.get(p)
    return o
for i in items[-14:]:
    kind = g(i, 'request', 'kind') or g(i, 'kind')
    purpose = g(i, 'request', 'purpose') or g(i, 'purpose')
    status = i.get('status') or i.get('state') or g(i, 'status', 'state')
    err = i.get('error') or i.get('failure') or g(i, 'status', 'error') or g(i, 'status', 'message') or ''
    print(i.get('updatedAt') or i.get('createdAt'), '|', status, '|', kind, '|', purpose, '|', str(err)[:160])
PY
