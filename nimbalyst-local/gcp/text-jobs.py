import json
d = json.load(open('/mnt/data/objectquest/jobs.json'))
for k, v in d.items():
    j = v.get('job', v)
    if j.get('kind') == 'text' and (j.get('createdAt') or '') >= '2026-09-26T18:00':
        print('=== ', j.get('id'), j.get('state'), j.get('createdAt'))
        print('request:', json.dumps(j.get('request'))[:700])
        print('providerJobId:', j.get('providerJobId'), '| capabilityUsed:', j.get('capabilityUsed'), '| retryCount:', j.get('retryCount'), '| uiMessage:', j.get('uiMessage'))
        print('lastError:', json.dumps(j.get('lastError')))
        print('internal:', json.dumps({kk: vv for kk, vv in (v.get('internal') or {}).items() if kk != 'lastProviderStatusRaw'})[:400])
        print('raw:', json.dumps((v.get('internal') or {}).get('lastProviderStatusRaw'))[:900])