"""Collect verified supplements from the workflow journal into supp.json (verify result preferred over draft)."""
import json, sys
J = '/root/.claude/projects/-home-user-deepgemm/e94ff429-49e0-569f-8e10-b686957a7fd5/subagents/workflows/wf_52f09ea0-965/journal.jsonl'
lab = {}
res = {}
for l in open(J, encoding='utf8'):
    j = json.loads(l)
    if j.get('type') == 'started':
        lab[j['agentId']] = j['label']
    elif j.get('type') == 'result' and j.get('result'):
        res[lab.get(j['agentId'], j['agentId'])] = j['result']
groups = []
for k in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']:
    r = res.get('verify:' + k)
    src = 'verify'
    if r is None:
        r = res.get('draft:' + k); src = 'draft'
    if r is None:
        continue
    groups.append({'key': k, 'src': src, 'result': r})
ov = res.get('verify:overview') or res.get('draft:overview')
json.dump({'groups': groups, 'overview': ov}, open('supp.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
for g in groups:
    r = g['result']
    print(g['key'], g['src'], 'sec', len(r.get('sections', [])), 'notes', len(r.get('notes', [])), 'mn', len(r.get('mnemonics', [])), 'cards', len(r.get('cards', [])), 'issues', len(r.get('issues', [])))
print('overview', 'verify' if res.get('verify:overview') else ('draft' if ov else 'none'))
