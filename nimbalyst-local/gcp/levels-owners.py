import json, os
root = '/mnt/data/objectquest'
levels = json.load(open(os.path.join(root, 'levels.json')))
own = json.load(open(os.path.join(root, 'ownership.json'))) if os.path.exists(os.path.join(root, 'ownership.json')) else {}
acc = json.load(open(os.path.join(root, 'accounts.json'))) if os.path.exists(os.path.join(root, 'accounts.json')) else {}
print('accounts.json:', json.dumps(acc)[:400])
print('ownership.json type:', type(own).__name__, 'keys sample:', list(own.keys())[:5] if isinstance(own, dict) else len(own))
items = levels if isinstance(levels, list) else (levels.get('levels') or levels.get('items') or list(levels.values()))
if isinstance(items, dict): items = list(items.values())
print('levels:', len(items))
for L in items:
    m = L.get('manifest') or L
    lid = L.get('id') or m.get('id')
    o = None
    if isinstance(own, dict):
        for k, v in own.items():
            if isinstance(v, dict) and (v.get('id') == lid or k.endswith(str(lid))):
                o = v; break
        if o is None:
            o = own.get('level:' + str(lid)) or own.get(str(lid))
    print('-', lid, '|', m.get('name') or m.get('title'), '| updated', L.get('updatedAt') or m.get('updatedAt'), '| ownerId', L.get('ownerId'), '| own', json.dumps(o)[:160] if o else None, '| keys', sorted(L.keys())[:12])
print('--- ownership entries (last 8) ---')
if isinstance(own, dict):
    ks = list(own.keys())
    for k in ks[-8:]:
        print(k, json.dumps(own[k])[:200])
