#!/usr/bin/env python3
"""Completeness check: every source line / table cell must appear, in order,
in the text of the generated page's original-content container.

usage: check_complete.py source.md page.html [container-id]
"""
import re, sys
from bs4 import BeautifulSoup

src_path, page_path = sys.argv[1], sys.argv[2]
cid = sys.argv[3] if len(sys.argv) > 3 else 'orig'
raw = open(src_path, encoding='utf8').read()
raw = raw.replace('「', '“').replace('」', '”').replace('『', '‘').replace('』', '’').replace('甚么', '什么')

soup = BeautifulSoup(open(page_path, encoding='utf8').read(), 'lxml')
root = soup.select_one(cid) if cid[:1] in '.#' else soup.find(id=cid)
# drop everything that is added content (must not count towards completeness)
for el in root.select('[data-added]'):
    el.decompose()
page = re.sub(r'\s+', '', root.get_text())


def norm(s):
    s = re.sub(r'\s+', '', s)
    return s


fragments = []
in_fence = False
for ln in raw.split('\n'):
    if ln.startswith('```'):
        in_fence = not in_fence
        continue
    if in_fence:
        if ln.strip():
            fragments.append(('code', ln))
        continue
    s = ln.strip()
    if not s or re.fullmatch(r'-{3,}', s) or re.fullmatch(r'\|?\s*:?-{3,}.*', s) and set(s) <= set('|-: '):
        continue
    s = re.sub(r'^#{1,6}\s+', '', s)
    s = re.sub(r'^>\s?', '', s)
    s = re.sub(r'^(?:[-*]|\d+\.)\s+', '', s)
    if s.startswith('|'):
        cells = [c.strip() for c in s.strip('|').split('|')]
        for c in cells:
            c = c.replace('**', '')
            c = re.sub(r'(?<![＊\w])\*([^*]+)\*', r'\1', c)
            if c:
                fragments.append(('cell', c))
        continue
    s = s.replace('**', '')
    s = re.sub(r'(?<![＊\w])\*([^*]+)\*', r'\1', s)
    if s:
        fragments.append(('line', s))

missing = []
ooo = 0
pos = 0
for kind, f in fragments:
    nf = norm(f)
    if not nf:
        continue
    i = page.find(nf, pos)
    if i == -1:
        j = page.find(nf)
        if j == -1:
            missing.append((kind, f))
        else:
            ooo += 1
        continue
    pos = i + len(nf)

print(f'原文片段数 {len(fragments)} ／ 缺失数 {len(missing)} ／ 顺序异常 {ooo}')
for k, f in missing[:40]:
    print('  MISSING', k, f[:120])
sys.exit(1 if missing else 0)
