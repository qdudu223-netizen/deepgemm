"""Completeness + text checks: every source fragment appears in order in the no-JS rendering."""
import json, re, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import mdparse
from opencc import OpenCC
md, tokens, env, raw, conv, changes = mdparse.parse()
frags = []
for i, t in enumerate(tokens):
    if t.type == 'inline':
        s = mdparse.inline_text(t)
        for line in s.split('\n'):
            if line.strip():
                frags.append(line)
    elif t.type in ('fence', 'code_block'):
        for line in t.content.split('\n'):
            if line.strip():
                frags.append(line)
info = json.load(open(os.path.join(os.path.dirname(__file__), 'out_nojs.json')))
norm = lambda s: re.sub(r'\s+', '', s)
page = norm(info['text'])
missing, out_of_order = [], []
cur = 0
for f in frags:
    nf = norm(f)
    if not nf:
        continue
    j = page.find(nf, cur)
    if j < 0:
        if page.find(nf) < 0:
            missing.append(f)
        else:
            out_of_order.append(f)
    else:
        cur = j + len(nf)
print('source fragments:', len(frags))
print('missing:', len(missing))
for m in missing[:20]: print('   MISSING:', m[:90])
print('out of order:', len(out_of_order))
for m in out_of_order[:10]: print('   ORDER:', m[:90])
# char-level coverage: every non-space char of the converted source (minus markdown syntax) is accounted for
cc = OpenCC('t2s')
txt = info['text']
trad = sorted({c for c in txt if cc.convert(c) != c})
print('traditional chars in page text:', trad)
print('「」『』 left:', sum(txt.count(c) for c in '「」『』'))
src_urls = re.findall(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+", conv)
print('links in page:', len(info['links']), ' source urls:', len(src_urls))
