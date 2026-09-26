echo "--- container env (filtered) ---"
sudo docker inspect wanderkin-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(PROVIDER_MAX_IN_FLIGHT|GENERATION_MAX_RETRIES|LIVEPEER_MAX_AUTOMATIC_RETRIES|PROVIDER_CONCURRENCY_RETRY_SECONDS|NODE_ENV)=' || echo "none of those set (defaults apply)"
echo "--- container start/restart ---"
sudo docker inspect wanderkin-api --format 'StartedAt={{.State.StartedAt}} RestartCount={{.RestartCount}}'
sudo docker logs -t wanderkin-api 2>&1 | grep -i listening
echo "--- job_ed1c0f5e ---"
sudo python3 - <<'PY'
import json
d = json.load(open('/mnt/data/objectquest/jobs.json'))
v = d['job_ed1c0f5e-83b7-4011-9e14-21531babe43b']
j, i = v['job'], v.get('internal', {})
print('providerJobId:', j.get('providerJobId'))
print('internal keys:', sorted(i.keys()))
raw = i.get('lastProviderStatusRaw') or {}
print('lastProviderStatusRaw keys:', sorted(raw.keys()) if isinstance(raw, dict) else type(raw).__name__)
print('raw.state:', raw.get('state') if isinstance(raw, dict) else None)
print('raw.phase:', json.dumps(raw.get('phase'))[:200] if isinstance(raw, dict) else None)
print('internal (no raw):', json.dumps({k: x for k, x in i.items() if k != 'lastProviderStatusRaw'})[:600])
PY