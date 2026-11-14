#!/usr/bin/env python3
"""Convert the study-pack markdown into structured HTML (original content only).

Only three kinds of text change are applied programmatically:
  1. 「」『』 -> “”‘’
  2. 甚么 -> 什么 (reported in the change log)
  3. layout only (sections / cards / table wrappers)
Everything else is emitted verbatim.
"""
import json, re, sys, html as htmlmod
import html as H
from pathlib import Path
from markdown_it import MarkdownIt
from bs4 import BeautifulSoup, NavigableString, Tag

HERE = Path(__file__).parent
SRC = HERE / 'source.md'
OUT = HERE / 'out'
OUT.mkdir(exist_ok=True)

raw = SRC.read_text(encoding='utf8')

# ---------------------------------------------------------------- text normalisation
CHANGES = []
n_q = raw.count('「') + raw.count('」') + raw.count('『') + raw.count('』')
n_shen = raw.count('甚么')
# Keyword sentinels: original 「X」 terms become “X” wrapped in sentinels so we can
# later mark short ones as recitation keywords. Sentinels never reach the output.
KS, KE = '', ''
text = raw.replace('「', KS + '“').replace('」', '”' + KE).replace('『', '‘').replace('』', '’')
text = text.replace('甚么', '什么')
CHANGES.append({'what': '「」→“”', 'count': raw.count('「') + raw.count('」')})
CHANGES.append({'what': '甚么→什么', 'count': n_shen})

md = MarkdownIt('commonmark', {'html': False, 'linkify': False, 'breaks': True}).enable(['table'])

# ---------------------------------------------------------------- split into section units
lines = text.split('\n')
units = []          # list of dicts: id, level, title, body_lines
cur = {'id': 'top', 'level': 1, 'title': None, 'lines': []}
in_fence = False
CIRCLED = '①②③④⑤⑥⑦⑧⑨'
CN_NUM = {'〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7}
chapter_no = None
sec_no = None


def strip_ks(s):
    return s.replace(KS, '').replace(KE, '')


for ln in lines:
    if ln.startswith('```'):
        in_fence = not in_fence
    m = re.match(r'^(#{1,4}) (.*)$', ln) if not in_fence else None
    if m:
        level = len(m.group(1))
        title = m.group(2)
        if level == 1:
            cur['title'] = title
            continue
        units.append(cur)
        t = strip_ks(title)
        if level == 2:
            mm = re.search(r'([〇一二三四五六七])、', t)
            chapter_no = CN_NUM[mm.group(1)]
            uid = f'c{chapter_no}'
        elif level == 3:
            mm = re.match(r'(\d+)\.(\d+)', t)
            sec_no = f'{mm.group(1)}-{mm.group(2)}'
            uid = f's{sec_no}'
        else:
            mm = re.match(r'([①②③④⑤⑥⑦⑧⑨])', t)
            if mm:
                k = CIRCLED.index(mm.group(1)) + 1
            else:
                mm = re.match(r'题(\d+)', t)
                k = int(mm.group(1))
            uid = f's{sec_no}-{k}'
        cur = {'id': uid, 'level': level, 'title': title, 'lines': []}
        continue
    cur['lines'].append(ln)
units.append(cur)

# ---------------------------------------------------------------- helpers
URL_RE = re.compile(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+")
TAG_RE = re.compile(r'【[^【】\n]{1,40}】')
REF_RE = re.compile(r'\[R(\d+)\]')
EMOJI_MARKS = {'🔴': 'red', '🟡': 'yel', '🟢': 'grn', '⚫': 'base', '🔵': 'blue'}

TAG_CLASS = [
    ('已核实', 'ok'), ('推断', 'inf'), ('待查证', 'tbd'), ('假设性讨论', 'hyp'),
    ('通用史实', 'gen'), ('学者观点', 'sch'), ('所给材料', 'mat'), ('课本知识', 'mat'),
    ('官方评核资料', 'off'), ('原始史料', 'pri'), ('教学估评', 'tea'), ('课本练习', 'ex'),
    ('仿真题', 'ex'),
]


def tag_class(s):
    for k, c in TAG_CLASS:
        if k in s:
            return c
    return 'misc'


# numbers worth hiding for recitation: arabic numbers (with ranges / % / thousands)
NUM_RE = re.compile(r'(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?(?:%|(?:[—–\-／/～~]\d[\d,]*(?:\.\d+)?%?))*')
CN_CENT_RE = re.compile(r'(十[一二三四五六七八九]?|[二三四五六七八九]|一)(?=(?:至十[一二三四五六七八九]?)?世纪)|(?<=至)(十[一二三四五六七八九]?)(?=世纪)')
NUM_SKIP_PREFIX = ('资料', '图', '第', '题', '段', '例子', '表', '见', '脚注', '维度', '主体', '课题', '单元', '卷', 'R', '[R', '图片', '§', '程度：', '程度', '错处', '组别', '争议', '路径', '层次')


def num_skip(txt, start, token):
    pre = txt[max(0, start - 3):start]
    for p in NUM_SKIP_PREFIX:
        if pre.endswith(p):
            return True
    # section cross refs such as 2.3 / 3.2 / 5.4 followed by section-ish chars
    if re.fullmatch(r'\d\.\d', token):
        post = txt[start + len(token):start + len(token) + 2]
        if pre.endswith(('见', '（见', '对应')) or post.startswith(('⑥', '⑤', '④', '争议', '、', '）')) or pre[-1:] in ('见',):
            return True
    if re.fullmatch(r'\d\.\d', token):
        post = txt[start + len(token):start + len(token) + 2]
        # data such as 2.2倍 / 5.3万 / 6.5小时 ; otherwise a section / volume number
        return not (post[:1] in ('倍', '万', '%', '亿', '个', '岁') or post.startswith('小时'))
    return False


def inline_transform(soup, el, in_heading=False):
    """Recursively transform text nodes: tags, refs, urls, numbers, keyword sentinels."""
    for child in list(el.children):
        if isinstance(child, Tag):
            if child.name in ('a', 'code', 'pre'):
                continue
            inline_transform(soup, child, in_heading)
            continue
        if not isinstance(child, NavigableString):
            continue
        s = str(child)
        if not s:
            continue
        frags = tokenize(s, in_heading)
        if len(frags) == 1 and frags[0][0] == 'text':
            new = frags[0][1]
            if new != s:
                child.replace_with(NavigableString(new))
            continue
        new_nodes = []
        for kind, val in frags:
            if kind == 'text':
                new_nodes.append(NavigableString(val))
            elif kind == 'tag':
                t = soup.new_tag('span', attrs={'class': f'tag tag-{tag_class(val)}'})
                t.string = val
                new_nodes.append(t)
            elif kind == 'ref':
                t = soup.new_tag('a', attrs={'class': 'ref', 'href': f'#ref-R{val[2:-1]}'})
                t.string = val
                new_nodes.append(t)
            elif kind == 'url':
                t = soup.new_tag('a', attrs={'href': val, 'target': '_blank', 'rel': 'noopener'})
                t.string = val
                new_nodes.append(t)
            elif kind == 'num':
                t = soup.new_tag('span', attrs={'class': 'num'})
                t.string = val
                new_nodes.append(t)
            elif kind == 'kw':
                t = soup.new_tag('span', attrs={'class': 'kw'})
                t.string = val
                new_nodes.append(t)
        for n in new_nodes:
            child.insert_before(n)
        child.extract()


def tokenize(s, in_heading):
    """Split a raw string into typed fragments. Handles sentinels first."""
    out = []
    # 1) keyword sentinels  KS “X” KE
    pos = 0
    pieces = []
    for m in re.finditer(KS + '“([^' + KS + KE + ']*)”' + KE, s):
        pieces.append(('raw', s[pos:m.start()]))
        inner = m.group(1)
        pieces.append(('quote', inner))
        pos = m.end()
    pieces.append(('raw', s[pos:]))
    for kind, val in pieces:
        if kind == 'quote':
            val_clean = val
            out.append(('text', '“'))
            if 1 <= len(val_clean) <= 14 and not in_heading and not re.search(r'[，。；：！？]', val_clean):
                out.append(('kw', val_clean))
            else:
                out.extend(tokenize_plain(val_clean, in_heading))
            out.append(('text', '”'))
        else:
            val = val.replace(KS, '').replace(KE, '')
            out.extend(tokenize_plain(val, in_heading))
    # merge adjacent text
    merged = []
    for k, v in out:
        if k == 'text' and merged and merged[-1][0] == 'text':
            merged[-1] = ('text', merged[-1][1] + v)
        elif v != '' or k != 'text':
            merged.append((k, v))
    return merged or [('text', '')]


def tokenize_plain(s, in_heading):
    spans = []
    for m in URL_RE.finditer(s):
        u = m.group(0)
        # trim trailing ascii punctuation that is unlikely part of the url
        while u and u[-1] in '.,;)':
            if u[-1] == ')' and u.count('(') >= u.count(')'):
                break
            u = u[:-1]
        spans.append((m.start(), m.start() + len(u), 'url', u))
    for m in TAG_RE.finditer(s):
        spans.append((m.start(), m.end(), 'tag', m.group(0)))
    for m in REF_RE.finditer(s):
        spans.append((m.start(), m.end(), 'ref', m.group(0)))
    spans.sort()
    # remove overlaps (url wins over ref inside urls etc.)
    clean = []
    last = -1
    for sp in spans:
        if sp[0] >= last:
            clean.append(sp)
            last = sp[1]
    out = []
    pos = 0
    for a, b, k, v in clean:
        if a > pos:
            out.extend(tokenize_nums(s[pos:a], in_heading))
        out.append((k, v))
        pos = b
    if pos < len(s):
        out.extend(tokenize_nums(s[pos:], in_heading))
    return out


def tokenize_nums(s, in_heading):
    if in_heading:
        return [('text', s)]
    spans = []
    for m in NUM_RE.finditer(s):
        tok = m.group(0)
        if num_skip(s, m.start(), tok):
            continue
        spans.append((m.start(), m.end(), tok))
    for m in CN_CENT_RE.finditer(s):
        g = m.group(0)
        spans.append((m.start(), m.end(), g))
    spans.sort()
    out = []
    pos = 0
    last = -1
    for a, b, v in spans:
        if a < last:
            continue
        if a > pos:
            out.append(('text', s[pos:a]))
        out.append(('num', v))
        pos = b
        last = b
    if pos < len(s):
        out.append(('text', s[pos:]))
    return out


# ---------------------------------------------------------------- render units
BLOCK_TAGS = ('p', 'li', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'pre')
all_blocks = []
answer_rules = {}


def first_text(el):
    return el.get_text()[:2]


def classify_mark(el):
    t = el.get_text().lstrip()
    for e, c in EMOJI_MARKS.items():
        if t.startswith(e):
            rest = t[len(e):].lstrip()
            extra = None
            for e2, c2 in EMOJI_MARKS.items():
                if rest.startswith(e2):
                    extra = c2
            return c, extra
    return None, None


def is_label_para(p):
    """Paragraph whose first meaningful child is <strong> (optionally after an emoji)."""
    if p.name != 'p':
        return False
    kids = [k for k in p.children if not (isinstance(k, NavigableString) and not str(k).strip())]
    if not kids:
        return False
    k0 = kids[0]
    if isinstance(k0, NavigableString):
        s = str(k0).strip()
        if s in EMOJI_MARKS or all(ch in ''.join(EMOJI_MARKS) for ch in s.replace(' ', '')):
            return len(kids) > 1 and isinstance(kids[1], Tag) and kids[1].name == 'strong'
        return False
    return k0.name == 'strong'


def strong_only(p):
    kids = [k for k in p.children if not (isinstance(k, NavigableString) and not str(k).strip())]
    return len(kids) == 1 and isinstance(kids[0], Tag) and kids[0].name == 'strong'


MERMAID_COUNTER = [0]


def render_unit(u):
    body_md = '\n'.join(u['lines'])
    # thematic breaks are section separators only
    body_md = re.sub(r'(?m)^---\s*$', '', body_md)
    h = md.render(body_md)
    soup = BeautifulSoup(f'<div class="ub">{h}</div>', 'lxml')
    root = soup.find('div', class_='ub')

    # code fences
    for pre in root.find_all('pre'):
        code = pre.find('code')
        cls = (code.get('class') or [''])[0] if code else ''
        txt = code.get_text() if code else pre.get_text()
        if 'mermaid' in cls:
            MERMAID_COUNTER[0] += 1
            kind = 'mindmap' if txt.lstrip().startswith('mindmap') else 'flowchart'
            fig = soup.new_tag('figure', attrs={'class': f'mermaid-fig', 'data-mermaid': kind, 'id': f'mermaid-{kind}'})
            slot = soup.new_tag('div', attrs={'class': 'mermaid-render', 'data-slot': f'mermaid-{kind}'})
            fig.append(slot)
            det = soup.new_tag('div', attrs={'class': 'mermaid-src', 'data-collapsible': 'src'})
            cap = soup.new_tag('div', attrs={'class': 'src-cap'})
            cap.string = 'Mermaid 源代码（原文）'
            det.append(cap)
            npre = soup.new_tag('pre', attrs={'class': 'code'})
            ncode = soup.new_tag('code')
            ncode.string = txt.replace(KS, '').replace(KE, '')
            npre.append(ncode)
            det.append(npre)
            fig.append(det)
            pre.replace_with(fig)
        else:
            npre = soup.new_tag('pre', attrs={'class': 'tree'})
            npre.string = txt.replace(KS, '').replace(KE, '')
            pre.replace_with(npre)

    # tables -> wrappers + row classes
    for tbl in root.find_all('table'):
        wrap = soup.new_tag('div', attrs={'class': 'tbl-wrap'})
        tbl.wrap(wrap)
        for tr in tbl.find_all('tr'):
            tds = tr.find_all(['td', 'th'])
            if not tds:
                continue
            first = tds[0].get_text().strip()
            for e, c in EMOJI_MARKS.items():
                if first.startswith(e) and c in ('red', 'yel'):
                    tr['class'] = tr.get('class', []) + [f'row-{c}']
            if tr.find('strong') and tr.parent.name == 'tbody':
                # bold inside a row (e.g. the worst cholera wave) -> key row
                if all(td.find('strong') for td in tds):
                    tr['class'] = tr.get('class', []) + ['row-key']

    # paragraphs whose later lines start with their own marker (🔴🟡🟢⚫🔵): give every marked line its own
    # colour instead of colouring the whole paragraph by its first line (text unchanged, <br> replaced by block lines)
    def own_lines(p):
        lines, cur = [], []
        for ch in list(p.children):
            if isinstance(ch, Tag) and ch.name in ('ul', 'ol'):
                break
            if isinstance(ch, Tag) and ch.name == 'br':
                lines.append((cur, ch)); cur = []
            else:
                cur.append(ch)
        lines.append((cur, None))
        return lines

    def line_text(nodes):
        return ''.join(n.get_text() if isinstance(n, Tag) else str(n) for n in nodes)

    for p in root.find_all(['p', 'li']):
        if not p.find('br', recursive=False):
            continue
        lines = own_lines(p)
        marks = [classify_mark(BeautifulSoup('<p>' + H.escape(line_text(n)) + '</p>', 'html.parser').p)[0] for n, _ in lines]
        if len(lines) < 2 or not any(m for m in marks[1:]):
            continue
        for (nodes, br), m in zip(lines, marks):
            if nodes:
                sp = soup.new_tag('span', attrs={'class': 'mk-line' + (f' mk-{m}' if m else '')})
                nodes[0].insert_before(sp)
                for n in nodes:
                    sp.append(n.extract())
            if br is not None:
                br.extract()
        p['data-lines'] = '1'

    # paragraphs: emoji classes, label / minihead detection
    for p in root.find_all(['p', 'li']):
        c, extra = classify_mark(p) if not p.has_attr('data-lines') else (None, None)
        if p.has_attr('data-lines'):
            del p['data-lines']
        if c:
            cls = [f'mk', f'mk-{c}'] + ([f'mk2-{extra}'] if extra else [])
            p['class'] = p.get('class', []) + cls
        if p.name == 'p' and strong_only(p):
            p['class'] = p.get('class', []) + ['minihead']
    for bq in root.find_all('blockquote'):
        bq['class'] = bq.get('class', []) + ['quote']

    # inline transforms
    for el in root.find_all(BLOCK_TAGS):
        pass
    inline_transform(soup, root)

    return soup, root


def heading_html(soup, u):
    tag = soup.new_tag(f'h{u["level"]}')
    tag.append(BeautifulSoup(md.renderInline(u['title']), 'lxml').body or '')
    return tag


# Build the document
doc_soup = BeautifulSoup('<div id="orig"></div>', 'lxml')
orig = doc_soup.find('div', id='orig')

unit_meta = []
chapter_el = None
sec3_el = None
for u in units:
    soup, root = render_unit(u)
    # heading
    if u['id'] == 'top':
        hdr = doc_soup.new_tag('header', attrs={'class': 'doc-head', 'id': 'top'})
        h1 = doc_soup.new_tag('h1', attrs={'class': 'doc-title'})
        frag = BeautifulSoup(md.renderInline(units[0]['title'] or ''), 'lxml')
        h1.append(BeautifulSoup(md.renderInline(raw.split('\n')[0][2:]), 'html.parser'))
        hdr.append(h1)
        for child in list(root.children):
            hdr.append(child)
        orig.append(hdr)
        unit_meta.append({'id': 'top', 'level': 1, 'title': strip_ks(raw.split('\n')[0][2:])})
        continue
    title_html = md.renderInline(u['title'])
    hsoup = BeautifulSoup(f'<h{u["level"]}>{title_html}</h{u["level"]}>', 'html.parser')
    htag = hsoup.find(f'h{u["level"]}')
    inline_transform(hsoup, htag, in_heading=True)
    htag['id'] = 'h-' + u['id']
    if u['level'] == 2:
        sec = doc_soup.new_tag('section', attrs={'class': 'chapter', 'id': u['id'], 'data-unit': u['id'] if u['id'] == 'c0' else None})
        if sec.get('data-unit') is None:
            del sec['data-unit']
        hd = doc_soup.new_tag('div', attrs={'class': 'chap-head'})
        hd.append(htag)
        sec.append(hd)
        body = doc_soup.new_tag('div', attrs={'class': 'chap-intro' + (' unit-body' if u['id'] == 'c0' else '')})
        for child in list(root.children):
            body.append(child)
        sec.append(body)
        orig.append(sec)
        chapter_el = sec
        sec3_el = None
    elif u['level'] == 3:
        is_container = u['id'] in ('s3-2', 's6-5')
        sec = doc_soup.new_tag('section', attrs={'class': 'sec' + (' sec-group' if is_container else ''), 'id': u['id']})
        if not is_container:
            sec['data-unit'] = u['id']
        hd = doc_soup.new_tag('div', attrs={'class': 'sec-head'})
        hd.append(htag)
        sec.append(hd)
        body = doc_soup.new_tag('div', attrs={'class': 'sec-body' + ('' if is_container else ' unit-body')})
        for child in list(root.children):
            body.append(child)
        sec.append(body)
        chapter_el.append(sec)
        sec3_el = sec
    else:
        sec = doc_soup.new_tag('section', attrs={'class': 'sec sub', 'id': u['id'], 'data-unit': u['id']})
        hd = doc_soup.new_tag('div', attrs={'class': 'sec-head'})
        hd.append(htag)
        sec.append(hd)
        body = doc_soup.new_tag('div', attrs={'class': 'sec-body unit-body'})
        for child in list(root.children):
            body.append(child)
        sec.append(body)
        sec3_el.find('div', class_='sec-body', recursive=False).append(sec)
    unit_meta.append({'id': u['id'], 'level': u['level'], 'title': strip_ks(u['title'])})

# remove empty text-only whitespace bodies
for d in orig.find_all('div', class_='chap-intro'):
    if not d.get_text().strip() and not d.find(True):
        d.decompose()

# ---------------------------------------------------------------- answer groups
def wrap_group(blocks, label_text, gid):
    """Wrap a list of consecutive sibling elements into an answer body."""
    if not blocks:
        return
    first = blocks[0]
    box = doc_soup.new_tag('div', attrs={'class': 'ans-body', 'id': gid, 'data-ans-label': label_text})
    first.insert_before(box)
    for b in blocks:
        box.append(b.extract())


def label_of(p):
    st = p.find('strong')
    return st.get_text().strip() if st else p.get_text().strip()[:16]


ans_count = [0]


def process_answers_in(container, mode):
    kids = [k for k in container.children if isinstance(k, Tag)]
    groups = []  # (label_el or None, [body elements], inline)
    i = 0
    cur = None
    for k in kids:
        if k.name == 'section':
            continue
        if mode == 'q65':
            if k.name == 'blockquote' and cur is None and not groups:
                continue  # leading instructions stay visible
            if k.name == 'p' and is_label_para(k) and 'mk' not in k.get('class', []):
                cur = {'label': k, 'body': []}
                groups.append(cur)
                continue
            if 'mk-yel' in k.get('class', []):
                cur = None
                continue
            if cur is None:
                cur = {'label': None, 'body': []}
                groups.append(cur)
            cur['body'].append(k)
    for g in groups:
        ans_count[0] += 1
        gid = f'ans{ans_count[0]}'
        if g['label'] is not None:
            lab = g['label']
            lab['class'] = lab.get('class', []) + ['ans-label']
            lab['data-ans'] = gid
            # inline body after the first strong (e.g. **表现层次**：...)
            st = lab.find('strong')
            tail = []
            sib = st.next_sibling
            while sib is not None:
                tail.append(sib)
                sib = sib.next_sibling
            tail_text = ''.join(t.get_text() if isinstance(t, Tag) else str(t) for t in tail)
            if len(tail_text.strip()) > 30 and not g['body']:
                span = doc_soup.new_tag('span', attrs={'class': 'ans-inline', 'id': gid})
                st.insert_after(span)
                for t in tail:
                    span.append(t.extract())
                continue
            if not g['body']:
                del lab['data-ans']
                lab['class'] = [c for c in lab['class'] if c != 'ans-label']
                continue
            wrap_group(g['body'], label_of(lab), gid)
        else:
            wrap_group(g['body'], '答题框架', gid)
            box = doc_soup.find(id=gid)
            box['class'] = box.get('class', []) + ['ans-nolabel']


for sid in ('s6-5-1', 's6-5-2', 's6-5-3', 's6-5-4', 's6-5-5'):
    sec = orig.find('section', id=sid)
    body = sec.find('div', class_='sec-body', recursive=False)
    process_answers_in(body, 'q65')

# 7.2 reference answers; 3.2⑥ 参考答案 paragraphs
def wrap_after_label(sec_id, label_startswith, kind='next'):
    sec = orig.find('section', id=sec_id)
    body = sec.find('div', class_='sec-body', recursive=False)
    hits = 0
    for p in body.find_all('p', recursive=False):
        t = p.get_text().strip()
        if t.startswith(label_startswith):
            ans_count[0] += 1
            gid = f'ans{ans_count[0]}'
            st = p.find('strong')
            p['class'] = p.get('class', []) + ['ans-label']
            p['data-ans'] = gid
            tail = []
            sib = st.next_sibling
            while sib is not None:
                tail.append(sib)
                sib = sib.next_sibling
            tail_text = ''.join(x.get_text() if isinstance(x, Tag) else str(x) for x in tail)
            if kind == 'inline':
                # keep the leading '：' visible; stop before a following own-coloured line (出处/易错 notes are not the answer)
                span = doc_soup.new_tag('span', attrs={'class': 'ans-inline', 'id': gid})
                st.insert_after(span)
                for x in tail:
                    if isinstance(x, Tag) and 'mk-line' in (x.get('class') or []):
                        break
                    span.append(x.extract())
            else:
                nxt = p.find_next_sibling()
                wrap_group([nxt], st.get_text().strip(), gid)
            hits += 1
    return hits

assert wrap_after_label('s7-2', '参考答案') == 1
assert wrap_after_label('s3-2-6', '🔴 思考点参考答案') == 2
assert wrap_after_label('s3-2-6', '🔴 资料分析参考答案', 'inline') == 1

# ---------------------------------------------------------------- block ids
unit_of = {}
counter = {}
blocks = []
for el in orig.find_all(['p', 'li', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'pre']):
    if el.name == 'pre' and 'code' in el.get('class', []) and el.find_parent(class_='mermaid-src') is None:
        pass
    # owning unit
    sec = el.find_parent(attrs={'data-unit': True})
    if el.name in ('h3', 'h4', 'h2') and el.find_parent('section'):
        s2 = el.find_parent('section')
        uid = s2.get('id')
    elif sec is not None:
        uid = sec['data-unit']
    else:
        ch = el.find_parent('section', class_='chapter')
        uid = ch['id'] if ch else 'top'
    counter[uid] = counter.get(uid, 0) + 1
    bid = f'{uid}.{counter[uid]}'
    el['data-b'] = bid
    # text excluding nested blocks (nested li)
    blocks.append({'id': bid, 'unit': uid, 'tag': el.name})

# reference anchors
for li in orig.find_all('li'):
    t = li.get_text().strip()
    m = re.match(r'\[R(\d+)\]', t)
    if m and li.find_parent('section', id='s7-4'):
        li['id'] = f'ref-R{m.group(1)}'
        # the leading [R#] became a self-link: turn it into plain label
        a = li.find('a', class_='ref')
        if a is not None and a.get_text() == f'[R{m.group(1)}]':
            a.name = 'span'
            del a['href']
            a['class'] = ['ref-id']

# titles for ref links (hover)
ref_titles = {}
for li in orig.select('#s7-4 li[id^=ref-R]'):
    ref_titles[li['id']] = re.sub(r'\s+', ' ', li.get_text().strip())
for a in orig.find_all('a', class_='ref'):
    key = a['href'][1:]
    if key in ref_titles:
        a['title'] = ref_titles[key][:180]
    else:
        print('WARN unresolved ref', key, file=sys.stderr)

# small integers that only number table rows are not memorisation targets
for td in orig.find_all('td'):
    if re.fullmatch(r'\d{1,2}', td.get_text().strip()):
        for sp in td.find_all('span', class_='num'):
            sp.unwrap()
for el in orig.find_all(class_=True):
    if el.get('class') == [] or el.get('class') == ['']:
        del el['class']

# ensure no sentinel survived
html_out = str(orig)
assert KS not in html_out and KE not in html_out, 'sentinel leaked'

# ids for miniheads (for TOC/search context)
mh_n = 0
for p in orig.find_all('p', class_='minihead'):
    mh_n += 1
    p['id'] = f'mh{mh_n}'

(OUT / 'original.html').write_text(str(orig), encoding='utf8')

# ---------------------------------------------------------------- per-unit markdown for helpers
secdir = OUT / 'sections'
secdir.mkdir(exist_ok=True)
index = []
for u in units:
    body = '\n'.join(u['lines']).replace(KS, '').replace(KE, '')
    title = strip_ks(u['title'] or '')
    (secdir / f"{u['id']}.md").write_text(('#' * u['level'] + ' ' + title + '\n' if u['id'] != 'top' else '') + body, encoding='utf8')
    index.append({'id': u['id'], 'level': u['level'], 'title': title, 'chars': len(body)})
(OUT / 'units.json').write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf8')
(OUT / 'changes.json').write_text(json.dumps(CHANGES, ensure_ascii=False, indent=1), encoding='utf8')
print('units', len(units), 'blocks', len(blocks), 'answers', ans_count[0], 'bytes', len(html_out))
