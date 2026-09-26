import json, os
root = '/mnt/data/objectquest'
d = json.load(open(root + '/levels.json'))
items = d if isinstance(d, list) else (d.get('levels') or d.get('items') or list(d.values()))
if isinstance(items, dict): items = list(items.values())
print('levels:', len(items))
for L in items:
    m = L.get('manifest') or L
    print('-', L.get('id') or m.get('levelId') or m.get('id'), '|', m.get('name'), '| biome', json.dumps(m.get('biome')), '| updated', L.get('updatedAt') or m.get('createdAt'), '| media', 'media' in m, '| assets', len(m.get('assets') or []))
print('published:', len(json.load(open(root + '/published-levels.json'))) if os.path.exists(root + '/published-levels.json') else 'none')