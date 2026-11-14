#!/usr/bin/env python3
"""Build the single-file study page from source.md + supplements + app.css/app.js/shell.html.

Outputs (in ../dist):
  artifact.html                    – body content only (the Artifact publish wraps it)
  法国大革命及其历史意义.html        – full standalone document for download / offline use
  report.json                      – counts used by the self-check
"""
import hashlib
import html
import json
import os
import re
import sys

from markdown_it.token import Token

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mdparse  # noqa: E402

DIST = os.path.join(HERE, '..', 'dist')
TITLE = '法国大革命及其历史意义'
APP_ID = 'fr1789-d5'          # namespace for saved study data
TONE_OF = {'🔵': 'struct', '⚫': 'base', '🟢': 'ext', '🔴': 'key', '🟡': 'warn'}

esc = lambda s: html.escape(s, quote=False)  # noqa: E731
attr = lambda s: html.escape(s, quote=True)  # noqa: E731

md, tokens, env, RAW, CONV, QUOTE_CHANGES = mdparse.parse()
HEADS = mdparse.outline(tokens)
HEAD_AT = {h['i']: h for h in HEADS}
NUM2ID = {}
for h in HEADS:
    if h['num']:
        NUM2ID[h['num']] = h['id']
for h in HEADS:
    if h['level'] == 2 and h['num']:
        NUM2ID[h['num']] = h['id']

# ---------------------------------------------------------------- inline transforms
URL_RE = r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+"
REF_RE = r'〔R\d+〕'
SEC_RE = r'§\d+(?:\.\d+)*'
TAG_RE = r'【[^【】\n]{1,40}】'
_CORE = r'\d(?:\d|,(?=\d{3}))*(?:\.\d+)*'
_UNIT = r'(?:年代|世纪|年|月|日|亿|万|%|％)'
NUM_RE = r'(?<![A-Za-z0-9.\-])' + _CORE + _UNIT + r'?(?:(?:–|—|−|-|～|~|/|／)?' + _CORE + _UNIT + r'?)*(?![A-Za-z])'
MK_RE = r'[🔵⚫🟢🔴🟡⭐✅★]'
INLINE_RE = re.compile('(?P<url>%s)|(?P<ref>%s)|(?P<sec>%s)|(?P<tag>%s)|(?P<num>%s)|(?P<mk>%s)' % (
    URL_RE, REF_RE, SEC_RE, TAG_RE, NUM_RE, MK_RE))
NO_NUM_BEFORE = ('资料', '图片', '课题', '单元', '程度', '通函第', '注', 'pp.', 'p.', '编号', '第一', '第二')

CTX = {'nonum': False}
STATS = {'urls': [], 'refs': 0, 'secrefs': 0, 'tags': 0, 'nums': 0}


def tag_kind(inner):
    for pre, k in (('已核实', 'ok'), ('推断', 'inf'), ('待查证', 'tbd'), ('假设性', 'hyp'),
                   ('学者观点', 'sch'), ('官方评核', 'off'), ('教学估评', 'teach'), ('必备', 'must'),
                   ('选读', 'opt'), ('仿真题', 'src'), ('所给材料', 'src'), ('课本', 'src'),
                   ('原始史料', 'src'), ('深析', 'src')):
        if inner.startswith(pre):
            return k
    return 'misc'


def trim_url(u):
    while u and u[-1] in '.,;:':
        u = u[:-1]
    while u.endswith(')') and u.count('(') < u.count(')'):
        u = u[:-1]
    return u


def xform(text, nonum=False):
    out = []
    pos = 0
    for m in INLINE_RE.finditer(text):
        kind = m.lastgroup
        s = m.group(0)
        start = m.start()
        if kind == 'url':
            u = trim_url(s)
            out.append(esc(text[pos:start]))
            out.append('<a class="ext-link" href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (attr(u), esc(u)))
            STATS['urls'].append(u)
            pos = start + len(u)
            continue
        out.append(esc(text[pos:start]))
        if kind == 'ref':
            rid = s[1:-1]
            out.append('<a class="ref" href="#ref-%s" data-ref="%s">%s</a>' % (rid, rid, esc(s)))
            STATS['refs'] += 1
        elif kind == 'sec':
            num = s[1:]
            tid = NUM2ID.get(num)
            if tid:
                out.append('<a class="secref" href="#%s">%s</a>' % (tid, esc(s)))
                STATS['secrefs'] += 1
            else:
                out.append(esc(s))
        elif kind == 'tag':
            k = tag_kind(s[1:-1])
            out.append('<span class="tag tag-%s">%s</span>' % (k, esc(s)))
            STATS['tags'] += 1
        elif kind == 'num':
            before = text[max(0, start - 3):start]
            if nonum or CTX['nonum'] or any(before.endswith(b) for b in NO_NUM_BEFORE):
                out.append(esc(s))
            else:
                out.append('<span class="num">%s</span>' % esc(s))
                STATS['nums'] += 1
        elif kind == 'mk':
            t = TONE_OF.get(s, 'star' if s in '⭐★' else 'ok')
            out.append('<span class="mk mk-%s">%s</span>' % (t, s))
        pos = m.end()
    out.append(esc(text[pos:]))
    return ''.join(out)


def r_text(self, toks, idx, options, env):
    return xform(toks[idx].content)


def r_fence(self, toks, idx, options, env):
    t = toks[idx]
    info = (t.info or '').strip()
    if info == 'mermaid':
        return render_mermaid(t.content)
    body = xform(t.content.rstrip('\n'))
    return '<div class="pre-wrap mb-pre"><pre class="txt-diagram mb">%s</pre></div>\n' % body


def r_table_open(self, toks, idx, options, env):
    return '<div class="table-wrap"><table>\n'


def r_table_close(self, toks, idx, options, env):
    return '</table></div>\n'


def r_bq_open(self, toks, idx, options, env):
    return '<blockquote class="note">\n'


md.add_render_rule('text', r_text)
md.add_render_rule('fence', r_fence)
md.add_render_rule('table_open', r_table_open)
md.add_render_rule('table_close', r_table_close)
md.add_render_rule('blockquote_open', r_bq_open)


def tone_of_text(s):
    s = s.lstrip()
    return TONE_OF.get(s[:1])


NUMCELL = re.compile(r'^[约+−\-]?\d[\d.,]*(?:%|倍)?$')


def add_class(tok, cls):
    cur = tok.attrGet('class')
    tok.attrSet('class', (cur + ' ' + cls) if cur else cls)


def parent_li(i):
    lvl = tokens[i].level
    for j in range(i - 1, -1, -1):
        if tokens[j].type == 'list_item_open' and tokens[j].level == lvl - 1:
            return j
    return None


# ---- token annotation pass: tones, maskable blocks, star rows, numeric cells
for i, t in enumerate(tokens):
    if t.type == 'paragraph_open':
        inl = tokens[i + 1]
        tone = tone_of_text(mdparse.inline_text(inl))
        if t.hidden:
            li = parent_li(i)
            if li is not None:
                add_class(tokens[li], 'mb')
                if tone:
                    add_class(tokens[li], 't-' + tone)
        else:
            add_class(t, 'mb')
            if tone:
                add_class(t, 't-' + tone)
    elif t.type in ('td_open', 'th_open'):
        txt = mdparse.inline_text(tokens[i + 1]).strip()
        tone = tone_of_text(txt)
        if tone:
            add_class(t, 't-' + tone)
        if NUMCELL.match(txt):
            add_class(t, 'numcell')
        if t.type == 'td_open':
            add_class(t, 'mb')
    elif t.type == 'tr_open':
        j = i + 1
        if tokens[j].type in ('td_open', 'th_open'):
            txt = mdparse.inline_text(tokens[j + 1]).strip()
            if txt.startswith('⭐'):
                add_class(t, 'star')


# ---------------------------------------------------------------- structure
BLOCKS = mdparse.top_blocks(tokens)


def section_of_index():
    """Map token index -> list of active heading ids (h2/h3/h4)."""
    scope = {}
    stack = {}
    for i, t in enumerate(tokens):
        if i in HEAD_AT:
            h = HEAD_AT[i]
            stack = {k: v for k, v in stack.items() if k < h['level']}
            stack[h['level']] = h['id']
        scope[i] = list(stack.values())
    return scope


SCOPE = section_of_index()


def block_of_token(i):
    for k, (a, b) in enumerate(BLOCKS):
        if a <= i < b:
            return k
    return None


def find_anchor(section, anchor):
    """Return token index of the inline token containing anchor in section scope."""
    hits = []
    for i, t in enumerate(tokens):
        if t.type == 'inline' and section in SCOPE[i] and anchor in mdparse.inline_text(t):
            if i > 0 and tokens[i - 1].type == 'heading_open':
                continue
            hits.append(i)
        elif t.type == 'fence' and section in SCOPE[i] and anchor in t.content:
            hits.append(i)
    return hits


# ---------------------------------------------------------------- supplements
def load_supplements():
    items = []
    overview = None
    sdir = os.path.join(HERE, 'supp')
    if os.path.isdir(sdir):
        for fn in sorted(os.listdir(sdir)):
            if fn.endswith('.json'):
                d = json.load(open(os.path.join(sdir, fn), encoding='utf-8'))
                items.extend(d.get('items', []))
                if d.get('overview'):
                    overview = d['overview']
    return items, overview


def md_bold(s):
    """Escape and turn **x** into <b>."""
    s = esc(s)
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)


def refs_html(it):
    refs = it.get('refs') or []
    if not refs:
        return ''
    links = []
    for r in refs:
        r = str(r).lstrip('§')
        tid = NUM2ID.get(r)
        if not tid and '标记' in r:
            tid = 's-legend'
            links.append('<a class="secref" href="#s-legend">%s</a>' % esc(r))
            continue
        links.append('<a class="secref" href="#%s">§%s</a>' % (tid, esc(r)) if tid else ('§' + esc(r) if re.match(r'^\d', r) else esc(r)))
    return '<span class="supp-src">依据：%s</span>' % '、'.join(links)


def tone_cls(x):
    t = (x or {}).get('tone') if isinstance(x, dict) else x
    return ' tone-%s' % t if t else ''


def render_diagram(d):
    k = d['kind']
    if k == 'chain':
        steps = d['steps']
        labels = d.get('labels') or [''] * (len(steps) - 1)
        parts = []
        for n, s in enumerate(steps):
            date = '<span class="dg-date">%s</span>' % md_bold(s['date']) if s.get('date') else ''
            desc = '<span class="dg-d">%s</span>' % md_bold(s['d']) if s.get('d') else ''
            parts.append('<li class="dg-step%s">%s<b class="dg-t">%s</b>%s</li>' % (tone_cls(s), date, md_bold(s['t']), desc))
            if n < len(steps) - 1:
                lab = labels[n] if n < len(labels) else ''
                parts.append('<li class="dg-arrow" aria-hidden="true"><span>%s</span></li>' % md_bold(lab) if lab else '<li class="dg-arrow" aria-hidden="true"></li>')
        return '<ol class="dg dg-chain">%s</ol>' % ''.join(parts)
    if k == 'timeline':
        out = []
        cur = None
        for e in d['events']:
            ph = e.get('phase')
            if ph and ph != cur:
                out.append('<li class="dg-phase">%s</li>' % md_bold(ph))
                cur = ph
            star = ' is-star' if e.get('star') else ''
            desc = '<span class="dg-d">%s</span>' % md_bold(e['d']) if e.get('d') else ''
            out.append('<li class="dg-ev%s%s"><span class="dg-date">%s</span><span class="dg-body"><b class="dg-t">%s</b>%s</span></li>' % (
                tone_cls(e), star, md_bold(e['date']), md_bold(e['t']), desc))
        return '<ol class="dg dg-timeline">%s</ol>' % ''.join(out)
    if k == 'versus':
        def side(s, cls):
            items = ''.join('<li>%s</li>' % md_bold(x) for x in s['items'])
            return '<div class="dg-side %s%s"><h5>%s</h5><ul>%s</ul></div>' % (cls, tone_cls(s), md_bold(s['h']), items)
        verdict = '<p class="dg-verdict">%s</p>' % md_bold(d['verdict']) if d.get('verdict') else ''
        return '<div class="dg dg-versus">%s<span class="dg-vs" aria-hidden="true">vs</span>%s</div>%s' % (
            side(d['left'], 'l'), side(d['right'], 'r'), verdict)
    if k == 'layers':
        rows = ''.join('<div class="dg-layer%s"><b class="dg-k">%s</b><span class="dg-v">%s</span></div>' % (
            tone_cls(r), md_bold(r['k']), md_bold(r['v'])) for r in d['rows'])
        return '<div class="dg dg-layers">%s</div>' % rows
    if k == 'bars':
        mx = float(d['max'])
        unit = d.get('unit', '')
        rows = []
        for it in d['items']:
            pct = max(0.5, min(100.0, float(it['value']) / mx * 100))
            note = '<span class="dg-note">%s</span>' % md_bold(it['note']) if it.get('note') else ''
            val = ('%g' % it['value'])
            rows.append('<div class="dg-bar%s"><span class="dg-bl">%s</span><span class="dg-track"><span class="dg-fill" style="width:%.2f%%"></span></span><span class="dg-val"><span class="num">%s</span>%s %s</span></div>' % (
                tone_cls(it), md_bold(it['label']), pct, esc(val), esc(unit), note))
        scale = '<div class="dg-scale"><span>0</span><span>%s%s</span></div>' % (esc('%g' % mx), esc(unit))
        return '<div class="dg dg-bars">%s%s</div>' % (''.join(rows), scale)
    if k == 'parallel':
        cols = d['cols']
        head = '<div class="dg-prow dg-phead"><span class="dg-pdate"></span>%s</div>' % ''.join('<b>%s</b>' % md_bold(c) for c in cols)
        rows = ''.join('<div class="dg-prow"><span class="dg-pdate">%s</span>%s</div>' % (
            md_bold(r['date']), ''.join('<span class="dg-pc%s">%s</span>' % (' is-empty' if not c else '', md_bold(c) if c else '—') for c in r['cells']))
            for r in d['rows'])
        return '<div class="dg dg-parallel" style="--cols:%d">%s%s</div>' % (len(cols), head, rows)
    if k == 'tree':
        def node(n, depth):
            kids = n.get('children') or []
            inner = '<span class="dg-node%s">%s%s</span>' % (tone_cls(n), md_bold(n['t']),
                                                           ('<span class="dg-d">%s</span>' % md_bold(n['d'])) if n.get('d') else '')
            if kids:
                inner += '<ul>%s</ul>' % ''.join(node(c, depth + 1) for c in kids)
            return '<li>%s</li>' % inner
        return '<div class="dg dg-tree"><ul class="dg-tree-root">%s</ul></div>' % node(d['root'], 0)
    if k == 'cards':
        items = ''.join('<div class="dg-card%s"><b class="dg-t">%s</b>%s</div>' % (
            tone_cls(it), md_bold(it['h']), ('<span class="dg-d">%s</span>' % md_bold(it['d'])) if it.get('d') else '') for it in d['items'])
        return '<div class="dg dg-cards">%s</div>' % items
    if k == 'fork':
        f = d['from']
        br = ''.join('<div class="dg-branch%s"><b class="dg-t">%s</b>%s</div>' % (
            tone_cls(b), md_bold(b['t']), ('<span class="dg-d">%s</span>' % md_bold(b['d'])) if b.get('d') else '') for b in d['branches'])
        return '<div class="dg dg-fork"><div class="dg-from"><b class="dg-t">%s</b>%s</div><div class="dg-branches">%s</div></div>' % (
            md_bold(f['t']), ('<span class="dg-d">%s</span>' % md_bold(f['d'])) if f.get('d') else '', br)
    raise ValueError(k)


FIG_N = [0]


def render_supp_block(it):
    ty = it['type']
    if ty == 'diagram':
        FIG_N[0] += 1
        note = '<p class="fig-note">%s</p>' % md_bold(it['note']) if it.get('note') else ''
        return ('<figure class="supp fig" data-supp="diagram" id="fig-%d"><figcaption><span class="supp-badge">图解 · 补充</span>'
                '<span class="fig-title">%s</span></figcaption><div class="fig-body">%s</div>%s<div class="fig-foot">%s</div></figure>') % (
            FIG_N[0], md_bold(it['title']), render_diagram(it['diagram']), note, refs_html(it))
    if ty == 'mnemonic':
        keys = ''.join('<li><b>%s</b><span>%s</span></li>' % (md_bold(k['k']), md_bold(k['v'])) for k in it['keys'])
        note = '<p class="mn-note">%s</p>' % md_bold(it['text']) if it.get('text') else ''
        return ('<aside class="supp mnemo" data-supp="mnemonic"><div class="supp-head"><span class="supp-badge">记忆口诀 · 补充</span>'
                '<span class="mn-title">%s</span></div><p class="mn-verse">%s</p><ul class="mn-keys">%s</ul>%s<div class="fig-foot">%s</div></aside>') % (
            md_bold(it.get('title', '')), md_bold(it['verse']), keys, note, refs_html(it))
    if ty == 'gist':
        return ('<aside class="supp gist" data-supp="gist"><span class="supp-badge">本节总纲 · 补充</span>'
                '<p>%s</p>%s</aside>') % (md_bold(it['text']), refs_html(it))
    raise ValueError(ty)


def sidenote_html(it):
    return ('<span class="supp sn" data-supp="explain"><span class="sn-head"><span class="supp-badge">补充解释</span>'
            '<b class="sn-term">%s</b></span><span class="sn-text">%s%s</span></span>') % (
        md_bold(it['title']), md_bold(it['text']), (' ' + refs_html(it)) if it.get('refs') else '')


SUPP_ITEMS, OVERVIEW = load_supplements()
AFTER_BLOCK = {}      # top-level block index -> [html]
GISTS = {}            # section id -> [html]
SUPP_REPORT = {'placed': 0, 'failed': []}

for it in SUPP_ITEMS:
    ty = it.get('type')
    try:
        if ty == 'gist':
            GISTS.setdefault(it['section'], []).append(render_supp_block(it))
            SUPP_REPORT['placed'] += 1
            continue
        hits = find_anchor(it['section'], it['anchor'])
        if len(hits) != 1:
            SUPP_REPORT['failed'].append((it.get('id'), 'anchor hits %d' % len(hits)))
            continue
        i = hits[0]
        if ty == 'explain':
            tk = tokens[i]
            if tk.type != 'inline':
                SUPP_REPORT['failed'].append((it.get('id'), 'explain on fence'))
                continue
            tk.children.append(Token('html_inline', '', 0, content=sidenote_html(it)))
            # mark the host so CSS can reserve the margin
            host = i - 1
            if tokens[host].type == 'paragraph_open' and tokens[host].hidden:
                li = parent_li(host)
                if li is not None:
                    host = li
            add_class(tokens[host], 'has-sn')
        elif ty == 'conclusion':
            host = i - 1 if tokens[i].type == 'inline' else i
            if tokens[host].type == 'paragraph_open' and tokens[host].hidden:
                li = parent_li(host)
                host = li if li is not None else host
            add_class(tokens[host], 'is-concl')
        elif ty in ('diagram', 'mnemonic'):
            k = block_of_token(i)
            AFTER_BLOCK.setdefault(k, []).append(render_supp_block(it))
        SUPP_REPORT['placed'] += 1
    except Exception as e:  # noqa: BLE001
        SUPP_REPORT['failed'].append((it.get('id'), repr(e)))


# ---------------------------------------------------------------- mermaid
def render_mermaid(code):
    lines = [ln for ln in code.split('\n') if ln.strip()]
    assert lines[0].strip() == 'mindmap'
    root = None
    stack = []
    for ln in lines[1:]:
        indent = len(ln) - len(ln.lstrip(' '))
        txt = ln.strip()
        m = re.match(r'^\w+\(\((.*)\)\)$', txt)
        label = m.group(1) if m else txt
        node = {'t': label, 'children': [], 'raw': txt}
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if stack:
            stack[-1][1]['children'].append(node)
        else:
            root = node
        stack.append((indent, node))

    def li(n, depth):
        kids = ''.join(li(c, depth + 1) for c in n['children'])
        return '<li><span class="mm-node d%d">%s</span>%s</li>' % (depth, xform(n['t']), ('<ul>%s</ul>' % kids) if kids else '')

    tree = '<div class="mindmap" role="img" aria-label="导图"><ul class="mm-root">%s</ul></div>' % li(root, 0)
    src = '<div class="pre-wrap mm-src"><pre class="txt-diagram code-src">```mermaid\n%s```</pre></div>' % esc(code)
    return ('<div class="mermaid-block">%s<div class="mm-src-wrap" data-fold="mermaid">'
            '<button type="button" class="mm-src-toggle js-only" aria-expanded="false">查看 Mermaid 源码（原文）</button>%s</div></div>\n') % (tree, src)


# ---------------------------------------------------------------- rendering
def render_range(a, b):
    return md.renderer.render(tokens[a:b], md.options, env)


def heading_html(h):
    CTX['nonum'] = True
    try:
        inner = md.renderer.renderInline(tokens[h['i'] + 1].children, md.options, env)
    finally:
        CTX['nonum'] = False
    # split the leading number into its own span (text unchanged)
    inner = re.sub(r'^((?:<span class="mk[^>]*>[^<]*</span>\s*)?)(§?\d+(?:\.\d+)*)(\s)', r'\1<span class="hnum">\2</span>\3', inner)
    return inner


def is_marked_para(a):
    t = tokens[a]
    return t.type == 'paragraph_open' and any(c.startswith('t-') for c in (t.attrGet('class') or '').split())


def para_tone(a):
    for c in (tokens[a].attrGet('class') or '').split():
        if c.startswith('t-'):
            return c[2:]
    return None


def first_inline_text(a, b):
    for t in tokens[a:b]:
        if t.type == 'inline':
            return mdparse.inline_text(t)
    return ''


def group_blocks(entries):
    """entries: list of ('blk', k) | ('h4', head). Returns html list with marker groups."""
    out = []
    n = len(entries)
    i = 0
    while i < n:
        kind, val = entries[i]
        if kind == 'h4':
            h = val
            out.append('<h4 id="%s" class="sub-h">%s</h4>\n' % (h['id'], heading_html(h)))
            i += 1
            continue
        a, b = BLOCKS[val]
        if is_marked_para(a):
            tone = para_tone(a)
            members = [val]
            j = i + 1
            while j < n and entries[j][0] == 'blk':
                aa, bb = BLOCKS[entries[j][1]]
                tt = tokens[aa].type
                if tt in ('bullet_list_open', 'ordered_list_open', 'table_open') or (tt == 'paragraph_open' and not is_marked_para(aa)):
                    members.append(entries[j][1])
                    j += 1
                else:
                    break
            if len(members) > 1:
                inner = ''.join(block_html(k, False) for k in members)
                after = ''.join(''.join(AFTER_BLOCK.get(k, [])) for k in members)
                out.append('<div class="mgrp g-%s">%s</div>\n%s' % (tone, inner, after))
            else:
                out.append(block_html(val))
            i = j
            continue
        out.append(block_html(val))
        i += 1
    return out


def block_html(k, with_after=True):
    a, b = BLOCKS[k]
    s = render_range(a, b)
    if with_after and k in AFTER_BLOCK:
        s += ''.join(AFTER_BLOCK[k])
    return s


ANSWER_BTN = '<div class="answer-bar js-only"><button type="button" class="ans-toggle" aria-expanded="false" data-label="%s">%s</button></div>'


def fold(entries, start_pred, label, stop_pred=None, include_start=False):
    """Wrap runs of blocks after a start paragraph into an answer container.
    Returns new entries list with ('html', str) items for folded runs."""
    out = []
    n = len(entries)
    i = 0
    while i < n:
        kind, val = entries[i]
        if kind == 'blk' and start_pred(val):
            out.append(entries[i])
            j = i + 1
            run = []
            while j < n and entries[j][0] == 'blk' and not start_pred(entries[j][1]) and not (stop_pred and stop_pred(entries[j][1])):
                run.append(entries[j])
                j += 1
            if run:
                inner = ''.join(group_blocks(run))
                out.append(('html', '<div class="answer" data-answer>%s<div class="answer-body">%s</div></div>\n' % (
                    ANSWER_BTN % (label, label), inner)))
            i = j
            continue
        out.append(entries[i])
        i += 1
    return out


def starts_strong(k, pattern):
    a, b = BLOCKS[k]
    if tokens[a].type != 'paragraph_open':
        return False
    inl = tokens[a + 1].content
    return re.match(r'^<strong>' + pattern, inl) is not None


def render_entries(entries):
    html_parts = []
    buf = []
    for e in entries:
        if e[0] == 'html':
            html_parts.extend(group_blocks(buf))
            buf = []
            html_parts.append(e[1])
        else:
            buf.append(e)
    html_parts.extend(group_blocks(buf))
    return ''.join(html_parts)


CLOZE_DONE = []


def apply_section_specials(sid, entries):
    """Answer folding and cloze rules for exercise sections."""
    if sid == 's6-4':
        # Q1 填充: blanks are the bold words after the label
        for kind, val in entries:
            if kind != 'blk':
                continue
            a, b = BLOCKS[val]
            if tokens[a].type == 'paragraph_open' and tokens[a + 1].content.startswith('<strong>Q1 填充</strong>'):
                n = 0
                for ch in tokens[a + 1].children:
                    if ch.type == 'html_inline' and ch.content == '<strong>':
                        n += 1
                        if n > 1:
                            ch.content = '<strong class="cloze">'
                            CLOZE_DONE.append('Q1')
            if tokens[a].type == 'table_open':
                heads = [mdparse.inline_text(t) for t in tokens[a:b] if t.type == 'inline'][:3]
                if heads == ['陈述', '判断', '理由']:
                    col = 0
                    for t in tokens[a:b]:
                        if t.type == 'tr_open':
                            col = 0
                        elif t.type == 'td_open':
                            col += 1
                            if col >= 2:
                                add_class(t, 'cloze-cell')
                                CLOZE_DONE.append('fact')
        q = lambda k: starts_strong(k, r'(?:[①-⑩]|Q\d)')  # noqa: E731
        return fold(entries, q, '显示答案')
    if sid in ('s6-6-1', 's6-6-2'):
        start = lambda k: starts_strong(k, r'(?:考场可完成版|完整深化版)')  # noqa: E731
        stop = lambda k: starts_strong(k, r'表现层次')  # noqa: E731
        return fold(entries, start, '显示示范答案', stop)
    if sid == 's6-7':
        start = lambda k: starts_strong(k, r'Q\d')  # noqa: E731
        stop = lambda k: starts_strong(k, r'比较题的中层')  # noqa: E731
        return fold(entries, start, '显示框架', stop)
    if sid == 's7-4':
        start = lambda k: starts_strong(k, r'答案</strong>$') or (tokens[BLOCKS[k][0]].type == 'paragraph_open' and tokens[BLOCKS[k][0] + 1].content == '<strong>答案</strong>')  # noqa: E731
        return fold(entries, start, '显示答案')
    return entries


# Walk the document
front = {'blocks': []}
chapters = []
cur_folio = None
cur_chapter = None
for k, (a, b) in enumerate(BLOCKS):
    t = tokens[a]
    if t.type == 'hr':
        continue
    if t.type == 'heading_open':
        h = HEAD_AT[a]
        if h['level'] == 1:
            front['h1'] = h
        elif h['level'] == 2:
            cur_chapter = {'h': h, 'pre': [], 'folios': []}
            chapters.append(cur_chapter)
            cur_folio = None
        elif h['level'] == 3:
            cur_folio = {'h': h, 'entries': []}
            if cur_chapter is None:
                front.setdefault('folios', []).append(cur_folio)
            else:
                cur_chapter['folios'].append(cur_folio)
        else:
            cur_folio['entries'].append(('h4', h))
        continue
    if cur_folio is not None:
        cur_folio['entries'].append(('blk', k))
    elif cur_chapter is not None:
        cur_chapter['pre'].append(('blk', k))
    else:
        front['blocks'].append(('blk', k))


FOLIO_FOOT = ('<footer class="folio-foot js-only" data-for="{sid}">'
              '<label class="ff-master"><input type="checkbox" class="ff-check" data-sec="{sid}"> <span>已掌握</span></label>'
              '<button type="button" class="ff-btn ff-review" data-sec="{sid}">复习完</button>'
              '<span class="ff-due" data-sec="{sid}"></span>'
              '<span class="ff-spacer"></span>'
              '<button type="button" class="ff-btn ff-mask" data-sec="{sid}">遮住本节</button>'
              '<button type="button" class="ff-btn ff-clearhl" data-sec="{sid}">清空本节标记</button>'
              '</footer>')


def render_folio(f):
    h = f['h']
    sid = h['id']
    entries = apply_section_specials(sid, f['entries'])
    # also apply specials to h4 sub-sections (6.6)
    if sid == 's6-6':
        new = []
        cur = None
        segs = []
        for e in f['entries']:
            if e[0] == 'h4':
                segs.append((e, []))
            elif segs:
                segs[-1][1].append(e)
            else:
                new.append(e)
        entries = new
        for hd, ents in segs:
            entries.append(hd)
            entries.extend(apply_section_specials(hd[1]['id'], ents))
    gist = ''.join(GISTS.get(sid, []))
    # gists for h4 sub-sections go right after their heading
    body = render_entries(entries)
    for hh in HEADS:
        if hh['level'] == 4 and hh['sec'] == sid and hh['id'] in GISTS:
            marker = '<h4 id="%s"' % hh['id']
            pos = body.find(marker)
            if pos >= 0:
                end = body.find('</h4>', pos) + 5
                body = body[:end] + ''.join(GISTS[hh['id']]) + body[end:]
    tone = ''
    if '🔴' in h['text']:
        tone = ' folio-key'
    elif '🟢' in h['text']:
        tone = ' folio-ext'
    num = h['num'] or ''
    cote = ('§' + num) if num else '卷首'
    pages = re.search(r'（(pp?\.[\d–、]+)）', h['text'])
    cote2 = '<span class="cote-pages">%s</span>' % esc(pages.group(1)) if pages else ''
    return ('<article class="folio%s" id="%s" data-sec="%s" data-title="%s">\n'
            '<header class="folio-head"><div class="folio-cote" aria-hidden="true"><span>%s</span>%s</div>'
            '<h3>%s</h3><span class="stamp" aria-hidden="true">已掌握</span>'
            '<button type="button" class="fold-btn js-only" aria-expanded="true" aria-label="折叠本节" data-sec="%s"></button></header>\n'
            '<div class="folio-body">%s%s</div>\n%s</article>\n') % (
        tone, sid, sid, attr(re.sub(r'\s+', ' ', h['text'])), esc(cote), cote2, heading_html(h), sid, gist, body,
        FOLIO_FOOT.format(sid=sid))


def render_chapter(c):
    h = c['h']
    cid = h['id']
    pre = render_entries(c['pre'])
    folios = ''.join(render_folio(f) for f in c['folios'])
    numeral = (h['num'] or '')
    return ('<section class="chapter" id="%s" data-chap="%s">\n<header class="chap-head"><span class="chap-numeral" aria-hidden="true">%s</span>'
            '<h2>%s</h2></header>\n%s%s</section>\n') % (cid, cid, esc('§' + numeral), heading_html(h), pre, folios)


def render_overview():
    if not OVERVIEW:
        return ''
    ov = OVERVIEW
    chap_titles = {h['id']: h['text'] for h in HEADS if h['level'] == 2}
    rows = []
    for c in ov.get('chapters', []):
        t = chap_titles.get(c['id'], '')
        t = re.sub(r'^🔵\s*', '', t)
        rows.append('<li><a href="#%s" class="ov-chap"><span class="ov-num">%s</span><span class="ov-line">%s</span></a></li>' % (
            c['id'], esc(t.split(' ')[0]), md_bold(c['line'])))
    kws = ''.join('<span class="kw-chip" data-q="%s">%s</span>' % (attr(k.get('q') or k['k']), esc(k['k'])) for k in ov.get('keywords', []))
    mp = ''
    if ov.get('map'):
        mp = ('<figure class="supp fig ov-map" data-supp="diagram"><figcaption><span class="supp-badge">知识地图 · 补充</span>'
              '<span class="fig-title">%s</span></figcaption><div class="fig-body">%s</div></figure>') % (
            md_bold(ov.get('map_title', '全课知识地图')), render_diagram(ov['map']))
    return ('<section class="overview supp" id="overview" data-supp="overview">'
            '<header class="ov-head"><span class="supp-badge">学习概览 · 补充</span><h2 class="ov-title">先看全局</h2></header>'
            '<div class="ov-q"><span class="ov-q-label">核心问题</span><p>%s</p></div>'
            '<div class="ov-grid"><div class="ov-col"><h3 class="ov-h">各章一句话</h3><ol class="ov-chaps">%s</ol></div>'
            '<div class="ov-col"><h3 class="ov-h">关键词 <small class="js-only">点按即搜索</small></h3><div class="kw-chips">%s</div></div></div>'
            '%s</section>') % (md_bold(ov.get('question', '')), ''.join(rows), kws, mp)


def render_front():
    h1 = front['h1']
    CTX['nonum'] = True
    title = md.renderer.renderInline(tokens[h1['i'] + 1].children, md.options, env)
    CTX['nonum'] = False
    blocks = render_entries(front['blocks'])
    folios = ''.join(render_folio(f) for f in front.get('folios', []))
    return ('<header class="doc-head" id="top"><div class="doc-kicker" aria-hidden="true">中二历史 · 课题5 D · 学习卷宗</div>'
            '<h1>%s</h1><div class="doc-meta">%s</div></header>\n%s'
            '<section class="chapter chapter-front" id="c-front" data-chap="c-front"><header class="chap-head chap-head-sm"><span class="chap-numeral" aria-hidden="true">卷首</span>'
            '<h2 class="visually-plain">卷首说明</h2></header>%s</section>\n') % (title, blocks, render_overview(), folios)


DOC_HTML = render_front() + ''.join(render_chapter(c) for c in chapters)

# reference anchors in §7.6
DOC_HTML = re.sub(r'<li class="mb">(<a class="ref" href="#ref-(R\d+)" data-ref="R\d+">)', r'<li class="mb ref-item" id="ref-\2">\1', DOC_HTML)


# ---------------------------------------------------------------- flashcards
def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)


def table_rows(a, b):
    rows = []
    cur = None
    for t in tokens[a:b]:
        if t.type == 'tr_open':
            cur = []
        elif t.type == 'tr_close':
            rows.append(cur)
        elif t.type == 'inline' and cur is not None:
            cur.append(strip_tags(t.content).strip())
    return rows


TABLES = []  # (section ids, header, rows, block k)
for k, (a, b) in enumerate(BLOCKS):
    if tokens[a].type == 'table_open':
        rows = table_rows(a, b)
        TABLES.append((SCOPE[a], rows[0], rows[1:], k))

CARDS = []


def card(deck, front_txt, back_txt, sec, cid_extra=''):
    cid = 'k' + hashlib.sha1((deck + '|' + front_txt + cid_extra).encode()).hexdigest()[:9]
    CARDS.append({'id': cid, 'deck': deck, 'f': front_txt, 'b': back_txt, 's': sec})


def tables_where(sec, first_header=None):
    for scope, head, rows, k in TABLES:
        if sec in scope and (first_header is None or head[0] == first_header):
            yield head, rows, scope[-1]


def lab(h, v):
    return '%s：%s' % (h, v)


for head, rows, sid in tables_where('s2-3', '概念'):
    for r in rows:
        card('核心概念', '%s（%s）' % (r[0], r[1]), '\n'.join([lab(head[2], r[2]), lab(head[3], r[3])]), sid)
for head, rows, sid in tables_where('s2-4', '香港课本'):
    for r in rows:
        card('译名对照', r[0], '\n'.join([lab(head[1], r[1]), lab(head[2], r[2])]), sid)
for head, rows, sid in tables_where('s2-1', '要素'):
    deck = '5W1H'
    for r in rows:
        tag = '主题一至三' if len(head) == 3 else '课题延伸'
        card(deck, '%s · %s' % (tag, r[0]), r[1], sid)
for head, rows, sid in tables_where('s3-3', '#'):
    for r in rows:
        card('历史定格', r[1], r[2], sid)
for head, rows, sid in tables_where('s3-4', '#'):
    for r in rows:
        card('历史定格', r[1], r[2], sid)
for head, rows, sid in tables_where('s3-8-1', '时间'):
    for r in rows:
        back = r[1] + ('\n' + lab(head[3], r[3]) if r[3] not in ('—', '') else '')
        card('大事年表·欧洲', r[0], back, sid)
for head, rows, sid in tables_where('s3-8-2', '时间'):
    for r in rows:
        card('大事年表·亚洲', r[0], r[1], sid)
for head, rows, sid in tables_where('s3-8-3', '阶段'):
    for r in rows:
        card('阶段划分', r[0], '\n'.join([lab(head[1], r[1]), lab(head[2], r[2]), lab(head[3], r[3])]), sid)
for head, rows, sid in tables_where('s4-1', '层次'):
    for r in rows:
        card('成因层次', '%s：%s' % (r[0], r[1]), r[2], sid)
for head, rows, sid in tables_where('s4-3', '制度'):
    for r in rows:
        card('制度落差', r[0], '\n'.join([lab(head[1], r[1]), lab(head[2], r[2]), lab(head[3], r[3])]), sid)
for head, rows, sid in tables_where('s4-5', '人物／群体'):
    for r in rows:
        card('人物与群体', r[0], '\n'.join([lab(head[1], r[1]), lab(head[3], r[3]), lab(head[4], r[4]), lab(head[5], r[5])]), sid)
for head, rows, sid in tables_where('s4-6', '范围'):
    for r in rows:
        card('影响评估', '%s：%s' % (r[0], r[1]), '\n'.join(lab(head[c], r[c]) for c in range(2, 6)), sid)
for sec, deck in (('s4-7-1', '意大利 vs 德意志'), ('s4-7-2', '革命战争 vs 拿破仑战争'), ('s4-7-3', '蒙兀儿 vs 鄂图曼')):
    for head, rows, sid in tables_where(sec, '维度'):
        for r in rows:
            card(deck, '%s：%s' % (deck, r[0]), '\n'.join(lab(head[c], r[c]) for c in range(1, len(head))), sid)
for head, rows, sid in tables_where('s4-8', '关系'):
    for r in rows:
        card('关系网络', r[0], '\n'.join([lab(head[1], r[1]), lab(head[2], r[2])]), sid)
for head, rows, sid in tables_where('s5-1', '资料'):
    for r in rows:
        card('史料分析', r[0], '\n'.join([lab(head[1], r[1]), lab(head[4], r[4])]), sid)
for head, rows, sid in tables_where('s5-3', '议题'):
    for r in rows:
        card('多元史学', '%s · %s' % (r[0], r[2]), '\n'.join([lab(head[1], r[1]), lab(head[5], r[5])]), sid, r[1][:10])
for head, rows, sid in tables_where('s5-5', '#'):
    for r in rows:
        card('核心结论', '%s %s' % (r[0], r[1]), '\n'.join([lab(head[2], r[2]), lab(head[3], r[3])]), sid)
for head, rows, sid in tables_where('s6-1', '主题'):
    for r in rows:
        card('知识与题型', '主题%s · %s' % (r[0], r[1]), '\n'.join([lab(head[2], r[2]), lab(head[3], r[3]), lab(head[4], r[4])]), sid)
for head, rows, sid in tables_where('s6-3', '题型'):
    for r in rows:
        card('典型误答', '%s：%s' % (r[0], r[1]), '\n'.join([lab(head[2], r[2]), lab(head[3], r[3])]), sid)
for head, rows, sid in tables_where('s6-3', '易混点'):
    for r in rows:
        card('易错辨析', r[0], r[1], sid)


# 5.4 disputes: title paragraph before each table
def para_before_table(sec, header0):
    res = []
    last_p = None
    for k, (a, b) in enumerate(BLOCKS):
        if sec not in SCOPE[a]:
            continue
        if tokens[a].type == 'paragraph_open':
            last_p = strip_tags(tokens[a + 1].content)
        elif tokens[a].type == 'table_open':
            rows = table_rows(a, b)
            if rows[0][0] == header0:
                res.append((last_p, rows))
    return res


for title, rows in para_before_table('s5-4', '项目'):
    d = {r[0]: r[1] for r in rows[1:]}
    card('核心争议', '%s\n%s' % (title, d.get('待评估的结论', '')), lab('据证判断', d.get('据证判断', '')), 's5-4')

# 6.2 考点卡 and 7.1 核心总结 (ordered lists)
def list_items_after(sec):
    res = []
    label = None
    for k, (a, b) in enumerate(BLOCKS):
        if sec not in SCOPE[a]:
            continue
        if tokens[a].type == 'paragraph_open':
            label = strip_tags(tokens[a + 1].content)
        elif tokens[a].type == 'ordered_list_open':
            items = [strip_tags(t.content) for t in tokens[a:b] if t.type == 'inline']
            res.append((label, items))
    return res


for label, items in list_items_after('s6-2'):
    for n, it in enumerate(items, 1):
        m = re.match(r'^(.+?)：(.*)$', it)
        if m:
            card('考点卡', '%s · %d. %s' % (label, n, m.group(1)), m.group(2), 's6-2')

NUM_CLOZE = re.compile(NUM_RE)
for label, items in list_items_after('s7-1'):
    if label is None or '核心总结' in (label or '') or True:
        for n, it in enumerate(items, 1):
            if len(items) == 10:
                card('核心总结·填空', '%d. %s' % (n, NUM_CLOZE.sub('［　　］', it)), it, 's7-1')
    break

# 7.4 consolidation questions with answers
q74 = list_items_after('s7-4')
if len(q74) >= 2:
    for n, (qq, aa) in enumerate(zip(q74[0][1], q74[1][1]), 1):
        card('巩固题', '%d. %s' % (n, qq), aa, 's7-4')

# 6.4 practice: question paragraph -> 考场版 answer
cur_q = None
for k, (a, b) in enumerate(BLOCKS):
    if 's6-4' not in SCOPE[a]:
        continue
    if tokens[a].type == 'paragraph_open':
        txt = strip_tags(tokens[a + 1].content)
        if re.match(r'^[①-⑩]|^Q\d', txt):
            cur_q = txt
            if txt.startswith('Q1 填充'):
                raw_inl = tokens[a + 1].content
                parts = raw_inl.split('<strong>')
                blanked = parts[0] + '<strong>'.join([parts[1]] + [re.sub(r'^[^<]*</strong>', '［　　］', x) for x in parts[2:]])
                card('课本练习', strip_tags(blanked), txt, 's6-4')
    elif tokens[a].type == 'bullet_list_open' and cur_q:
        items = [strip_tags(t.content) for t in tokens[a:b] if t.type == 'inline']
        main = [x for x in items if x.startswith('考场版') or x.startswith('资料线索') or x.startswith('议题') or x.startswith('理由') or x.startswith('Q1 漫画家')]
        if main:
            card('课本练习', cur_q, '\n'.join(items[:2]), 's6-4')
        cur_q = None

# dedupe ids
seen = set()
uniq = []
for c in CARDS:
    if c['id'] in seen:
        c['id'] = c['id'] + 'x'
    seen.add(c['id'])
    uniq.append(c)
CARDS = uniq


# ---------------------------------------------------------------- assemble
def read(name):
    return open(os.path.join(HERE, name), encoding='utf-8').read()


def build():
    os.makedirs(DIST, exist_ok=True)
    shell = read('shell.html')
    css = read('app.css')
    jsdir = os.path.join(HERE, 'js')
    js = '\n'.join(open(os.path.join(jsdir, f), encoding='utf-8').read() for f in sorted(os.listdir(jsdir)) if f.endswith('.js'))
    assert '</script' not in js.lower(), 'script terminator inside JS'
    cards_json = json.dumps(CARDS, ensure_ascii=False).replace('</', '<\\/')
    meta_json = json.dumps({'appId': APP_ID, 'title': TITLE, 'build': hashlib.sha1(DOC_HTML.encode()).hexdigest()[:10]}, ensure_ascii=False)
    body = (shell.replace('/*__CSS__*/', css)
            .replace('<!--__DOC__-->', DOC_HTML)
            .replace('/*__CARDS__*/', cards_json)
            .replace('/*__META__*/', meta_json)
            .replace('/*__JS__*/', js))
    assert '__DOC__' not in body
    art = os.path.join(DIST, 'artifact.html')
    open(art, 'w', encoding='utf-8').write(body)
    head_end = body.index('<!--__HEAD_END__-->')
    standalone = ('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
                  + body[:head_end] + '</head>\n<body>\n' + body[head_end:] + '\n</body>\n</html>\n')
    open(os.path.join(DIST, TITLE + '.html'), 'w', encoding='utf-8').write(standalone)
    report = {
        'quote_changes': QUOTE_CHANGES,
        'urls': len(STATS['urls']), 'unique_urls': len(set(STATS['urls'])),
        'refs': STATS['refs'], 'secrefs': STATS['secrefs'], 'tags': STATS['tags'], 'nums': STATS['nums'],
        'cards': len(CARDS), 'decks': sorted({c['deck'] for c in CARDS}),
        'supp_items': len(SUPP_ITEMS), 'supp_placed': SUPP_REPORT['placed'], 'supp_failed': SUPP_REPORT['failed'],
        'figures': FIG_N[0], 'cloze': len(CLOZE_DONE),
        'size_kb': round(len(body.encode()) / 1024),
    }
    json.dump(report, open(os.path.join(DIST, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    build()
