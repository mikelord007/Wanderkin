import json
d = json.load(open('/mnt/data/objectquest/jobs.json'))
jobs = [v.get('job', v) for v in d.values()]
jobs.sort(key=lambda j: j.get('createdAt') or '')
for j in jobs[-12:]:
    req = j.get('request') or {}
    err = j.get('lastError') or {}
    print(j.get('createdAt'), '|', j.get('state'), '|', j.get('kind'), '|', req.get('purpose'), '| retry', j.get('retryCount'), '| prompt len', len(req.get('prompt') or ''), '| err:', (err.get('message') or '')[:220])