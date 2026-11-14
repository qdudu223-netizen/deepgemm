"""Parser-independent completeness check: strip markdown syntax from raw source lines and look for every piece."""
import json, re, os
src = open(os.path.join(os.path.dirname(__file__), '..', 'src', 'source_converted.md'), encoding='utf-8').read()
info = json.load(open(os.path.join(os.path.dirname(__file__), 'out_nojs.json')))
norm = lambda s: re.sub(r'\s+', '', s)
page = norm(info['text'])
pieces = []
in_fence = False
for line in src.split('\n'):
    if line.startswith('```'):
        in_fence = not in_fence
        continue
    if in_fence:
        if line.strip(): pieces.append(line)
        continue
    s = line.strip()
    if not s or s == '---' or re.fullmatch(r'\|?[-:| ]+\|?', s):
        continue
    s = re.sub(r'^#+\s*', '', s)
    s = re.sub(r'^>\s?', '', s)
    s = re.sub(r'^(?:[-*+]|\d+\.)\s+', '', s.strip())
    s = s.replace('**', '')
    s = re.sub(r'(?<![\*\w])\*([^*\n]+?)\*(?![\*\w])', r'\1', s)
    s = s.replace('<br>', '\n')
    cells = [c for c in (s.strip('|').split('|') if s.startswith('|') else [s])]
    for c in cells:
        for part in c.split('\n'):
            if part.strip(): pieces.append(part.strip())
miss = [p for p in pieces if norm(p) not in page]
print('raw pieces:', len(pieces), 'missing:', len(miss))
for m in miss[:30]: print('  MISSING:', m[:100])
