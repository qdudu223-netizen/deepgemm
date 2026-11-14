#!/usr/bin/env python3
"""Assemble the single-file study page.

inputs : out/original.html (convert.py), supp.json (verified supplements, optional),
         figs/D*.html (verified diagrams, optional), tpl/*.css, tpl/app.js
outputs: dist/<topic>.html (complete offline document) and dist/artifact.html (body-only for publishing)
"""
import json, re, sys, hashlib, html as H
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag

B = Path(__file__).parent
TOPIC = '工业革命（技术的革新）'
SLUG = 'ir-p40-63'
TITLE = '工业革命深析知识包'
LOG = []


def log(*a):
    LOG.append(' '.join(str(x) for x in a))


soup = BeautifulSoup('<div class="page"></div>', 'lxml')
page = soup.find('div', class_='page')
orig_src = BeautifulSoup((B / 'out/original.html').read_text(encoding='utf8'), 'lxml').find('div', id='orig')
head = orig_src.find('header', id='top')
head.extract()
page.append(head)
ov_slot = soup.new_tag('section', attrs={'id': 'overview', 'class': 'overview', 'data-added': 'overview'})
page.append(ov_slot)
page.append(orig_src)
ORIG = orig_src
units = json.loads((B / 'out/units.json').read_text(encoding='utf8'))
UNIT_TITLE = {u['id']: u['title'] for u in units}

CN = '〇一二三四五六七'


def norm(s):
    return re.sub(r'\s+', '', s or '')


def strip_emoji(s):
    return re.sub(r'^[\s🔴🟡🟢⚫🔵]+', '', s)


# ------------------------------------------------------------------ cosmetic structure (no text change)
eb = soup.new_tag('p', attrs={'class': 'doc-eyebrow', 'data-added': 'deco', 'aria-hidden': 'true'})
for t in ('Study Pack', 'Industrial Revolution', 'pp. 40 — 63'):
    sp = soup.new_tag('span'); sp.string = t; eb.append(sp)
head.insert(0, eb)

for h in page.find_all(['h1', 'h2', 'h3', 'h4']):
    first = h.contents[0] if h.contents else None
    if isinstance(first, NavigableString) and first.startswith('🔵'):
        rest = str(first)[1:]
        sp = soup.new_tag('span', attrs={'class': 'emo'}); sp.string = '🔵'
        first.replace_with(rest)
        h.insert(0, sp)

for sec in page.find_all(attrs={'data-unit': True}):
    uid = sec['data-unit']
    if uid.startswith('c'):
        sec['data-fig'] = '§ ' + CN[int(uid[1])]
    else:
        parts = uid[1:].split('-')
        lab = '§ ' + '.'.join(parts[:2])
        if len(parts) == 3:
            lab += (' ' + '①②③④⑤⑥'[int(parts[2]) - 1]) if parts[0] == '3' else (' 题' + parts[2])
        sec['data-fig'] = lab

for wrap in page.find_all('div', class_='tbl-wrap'):
    tr = wrap.find('tr')
    n = len(tr.find_all(['th', 'td'])) if tr else 0
    chars = len(wrap.get_text())
    if n >= 7 or (n >= 5 and chars > 2500):
        wrap['class'] = wrap['class'] + ['xwide']
    elif n >= 5 or (n >= 4 and chars > 1500):
        wrap['class'] = wrap['class'] + ['wide']

# numeric-only cells line up (tabular figures, right aligned)
for td in ORIG.find_all('td'):
    tx = td.get_text().strip()
    if re.search(r'\d', tx) and re.fullmatch(r'[\d,.\s%—–\-~约（）()倍万TJ+＋．]+', tx):
        td['class'] = td.get('class', []) + ['numcell']
for tbl in ORIG.find_all('table'):
    rows = [tr.find_all('td') for tr in tbl.find('tbody').find_all('tr')]
    ths = tbl.find('thead').find_all('th')
    for i, th in enumerate(ths):
        if i and rows and all(len(r) > i and 'numcell' in (r[i].get('class') or []) for r in rows):
            th['class'] = th.get('class', []) + ['numcol']

# strong: label vs recitation keyword
for st in ORIG.find_all('strong'):
    if st.find_parent(['h1', 'h2', 'h3', 'h4']) or st.find_parent(class_='minihead'):
        continue
    blk = st.find_parent(['p', 'li', 'td', 'th'])
    if blk is None:
        continue
    before = ''
    for x in blk.descendants:
        if x is st:
            break
        if isinstance(x, NavigableString):
            before += str(x)
    before = strip_emoji(before).strip()
    after = ''
    sib = st.next_sibling
    while sib is not None and len(after) < 2:
        after += sib.get_text() if isinstance(sib, Tag) else str(sib)
        sib = sib.next_sibling
    whole = norm(strip_emoji(blk.get_text())) == norm(st.get_text())
    is_label = (before == '' and (whole or after[:1] in '：:【（(' or st.get_text().endswith('：')))
    if not is_label and len(st.get_text()) <= 30:
        st['class'] = st.get('class', []) + ['kwb']

# ------------------------------------------------------------------ helpers for anchoring added content
BLOCK_SEL = ['p', 'li', 'td', 'th', 'pre', 'h2', 'h3', 'h4']


def unit_el(uid):
    if uid == 'top':
        return head
    return page.find(attrs={'data-unit': uid}) or page.find(id=uid)


def own_text(b):
    out = []
    for x in b.descendants:
        if isinstance(x, NavigableString):
            par = x.parent
            skip = False
            while par is not None and par is not b:
                if par.has_attr('data-b') or par.has_attr('data-added'):
                    skip = True
                    break
                par = par.parent
            if not skip:
                out.append(str(x))
    return ''.join(out)


def find_block(uid, anchor):
    if not anchor:
        return None
    a = norm(anchor)
    scopes = [unit_el(uid)] if unit_el(uid) is not None else []
    scopes.append(page)
    for sc in scopes:
        for b in sc.find_all(attrs={'data-b': True}):
            if b.find_parent(attrs={'data-added': True}) or b.has_attr('data-added'):
                continue
            if a in norm(own_text(b)):
                return b
    return None


def host_for(b):
    """element before/after which added content is inserted"""
    if b.name in ('td', 'th'):
        return b.find_parent('div', class_='tbl-wrap')
    if b.name == 'li':
        lst = b
        while lst.parent is not None and lst.parent.name in ('ul', 'ol', 'li'):
            lst = lst.parent
        return lst
    bq = b.find_parent('blockquote')
    if bq is not None:
        return bq
    if b.name in ('h3', 'h4', 'h2'):
        return None
    return b


def frag(html):
    return BeautifulSoup(html, 'html.parser')


def esc(s):
    return H.escape(s, quote=True)


# ------------------------------------------------------------------ supplements
supp_path = B / 'supp.json'
SUPP = json.loads(supp_path.read_text(encoding='utf8')) if supp_path.exists() else None
QA_CARDS = []
BELOW_LAST = {}
counts = {'lead': 0, 'sum': 0, 'note': 0, 'mn': 0, 'concl': 0, 'qa': 0, 'dropped': 0}
if SUPP:
    for g in SUPP['groups']:
        r = g.get('result') or {}
        for c in r.get('chapters', []):
            ch = page.find('section', id=c['id'])
            if ch is None:
                log('chapter missing', c['id']); continue
            hd = ch.find('div', class_='chap-head')
            p = frag(f'<p class="chap-sum" data-added="sum" data-b="a.c.{c["id"]}"><span class="added-tag">补充 · 本章总纲</span> {esc(c["summary"])}</p>')
            hd.append(p)
            counts['sum'] += 1
        for s in r.get('sections', []):
            u = unit_el(s['id'])
            if u is None:
                log('unit missing', s['id']); continue
            if s.get('lead'):
                lead = frag(f'<p class="lead" data-added="lead" data-b="a.l.{s["id"]}"><span class="added-tag">补充 · 本节要点</span>{esc(s["lead"])}</p>')
                if s['id'] == 'top':
                    head.append(lead)
                else:
                    body = u.find('div', class_='unit-body') or u.find('div', class_='chap-intro') or u.find('div', class_='sec-body')
                    body.insert(0, lead)
                counts['lead'] += 1
            if s.get('conclusion_anchor'):
                b = find_block(s['id'], s['conclusion_anchor'])
                if b is not None and b.name in ('p', 'li', 'td'):
                    b['class'] = b.get('class', []) + ['concl']
                    counts['concl'] += 1
                else:
                    log('conclusion anchor not found', s['id'], s['conclusion_anchor'])
        k = 0
        for kind, items in (('note', r.get('notes', [])), ('mn', r.get('mnemonics', []))):
            for it in items:
                b = find_block(it['unit'], it['anchor'])
                if b is None:
                    log('DROP', kind, it['unit'], it['anchor'])
                    counts['dropped'] += 1
                    continue
                host = host_for(b)
                k += 1
                bid = f'a.{kind}.{g["key"]}.{k}'
                if kind == 'note':
                    html = f'<aside class="side" data-added="note" data-b="{bid}"><span class="side-h"><span class="added-tag">补充解释</span>{esc(it["term"])}</span>{esc(it["text"])}</aside>'
                else:
                    html = f'<aside class="side mn" data-added="mnemonic" data-b="{bid}"><span class="side-h"><span class="added-tag">记忆口诀</span></span><span class="mn-text">{esc(it["text"])}</span><span class="mn-map">{esc(it["mapping"])}</span></aside>'
                if b.name in ('td', 'th') and host is not None:
                    html = html.replace('class="side', 'class="side below', 1)
                node = frag(html)
                if host is None:
                    u = unit_el(it['unit'])
                    body = u.find('div', class_='unit-body') or u.find('div', class_='chap-intro')
                    body.insert(0, node)
                elif b.name in ('td', 'th'):
                    # notes about a table cell sit right under the table (in source order)
                    after = BELOW_LAST.get(id(host), host)
                    after.insert_after(node)
                    BELOW_LAST[id(host)] = after.find_next_sibling()
                else:
                    host.insert_before(node)
                counts[kind] += 1
        for cd in r.get('cards', []):
            b = find_block(cd['unit'], cd['a'])
            if b is None:
                log('DROP qa card', cd['unit'], cd['a'][:30])
                counts['dropped'] += 1
                continue
            QA_CARDS.append({'unit': cd['unit'], 'q': cd['q'], 'a': cd['a'], 'src': UNIT_TITLE.get(cd['unit'], '')})
            counts['qa'] += 1

# ------------------------------------------------------------------ overview (补充)
OV = SUPP.get('overview') if SUPP else None
ch_titles = {}
for ch in ORIG.find_all('section', class_='chapter'):
    t = ch.find('h2').get_text().replace('🔵', '').strip()
    ch_titles[ch['id']] = t
COLS = [('cause', '原因'), ('develop', '主要发展'), ('impact', '影响'), ('response', '回应与思想'), ('skill', '历史技能')]
if OV:
    tiles = []
    tiles.append(f'<div class="ov-tile ov-q"><span class="added-tag">补充 · 学习概览</span><h3 data-b="a.ov.q">{esc(OV["core_question"])}</h3><p data-b="a.ov.a">{esc(OV["core_answer"])}</p></div>')
    pts = {c['id']: c['point'] for c in OV.get('chapter_points', [])}
    for cid in ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']:
        t = ch_titles.get(cid, '')
        num, _, name = t.partition('、')
        tiles.append(f'<div class="ov-tile ov-ch"><a href="#{cid}"><span class="n">第{esc(num)}章</span><span class="t">{esc(name)}</span><span class="p" data-b="a.ov.{cid}">{esc(pts.get(cid, ""))}</span></a></div>')
    kws = ''.join(f'<a href="#{esc(k["unit"])}" data-q="{esc(k["term"])}">{esc(k["term"])}</a>' for k in OV.get('keywords', []))
    tiles.append(f'<div class="ov-tile"><h4 class="ov-h">关键词 <span class="needs-js" style="font-weight:400;font-size:var(--fs-xs);color:var(--ink-3)">点按即全文搜索</span></h4><div class="ov-kw">{kws}</div></div>')
    nodes_by_col = {c: [] for c, _ in COLS}
    for n in OV.get('map_nodes', []):
        nodes_by_col.setdefault(n['col'], []).append(n)
    cols_html = ''
    for c, lab in COLS:
        nodes = ''.join(f'<button type="button" class="kmap-node c-{c}" data-node="{esc(n["id"])}" data-u="{esc(n["unit"])}">{esc(n["label"])}</button>' for n in nodes_by_col.get(c, []))
        cols_html += f'<div class="kmap-col"><h4>{lab}</h4>{nodes}</div>'
    edges = json.dumps([{'from': e['from'], 'to': e['to'], 'label': e['label']} for e in OV.get('map_edges', [])], ensure_ascii=False)
    tiles.append(f'<div class="ov-tile"><h4 class="ov-h">知识地图</h4><div class="kmap-wrap"><div class="kmap" data-edges="{esc(edges)}"><svg aria-hidden="true"></svg><div class="kmap-cols">{cols_html}</div></div></div><ul class="kmap-edges needs-js"><li>点按任一方块，查看它与其他知识点的关系（依据原文 1.2 关系说明表与 4.2 因果链）。</li></ul></div>')
    guide = ('<div class="ov-tile ov-guide"><h4 class="ov-h">怎样用这个网页</h4><ol>'
             '<li>先看上面的核心问题和各章要点，再按目录读；每节开头的“本节要点”是补充的结论先行。</li>'
             '<li>背诵：工具栏“遮词”“遮数”一键遮住关键词或年份数字，点按逐个显示；每节标题旁“遮本节”可整节遮住。</li>'
             '<li>荧光笔：选中文字即弹出三色条；标记自动保存，请在“设置”里定期复制备份码。</li>'
             '<li>复习：每节点“复习完”记录日期，按 1、2、4、7、15 天间隔提醒；“已掌握”计入进度。</li>'
             '<li>标有“补充”的内容是新增的，不是原文；工具栏“原文”可一键隐藏全部补充。</li></ol></div>')
    tiles.append(guide)
    ov_html = f'<div class="chap-head"><h2>学习概览 <span class="added-tag">补充</span></h2></div><div class="ov-grid">{"".join(tiles)}</div>'
    ov_slot.append(frag(ov_html))
else:
    ov_slot.decompose()

# ------------------------------------------------------------------ mindmap rendering (original mermaid source -> tree)
mm_fig = page.find('figure', attrs={'data-mermaid': 'mindmap'})
if mm_fig is not None:
    code = mm_fig.find('code').get_text()
    lines = [l for l in code.split('\n')[1:] if l.strip()]
    tree = []
    stack = []
    for l in lines:
        ind = (len(l) - len(l.lstrip(' '))) // 2
        node = {'t': l.strip(), 'c': []}
        while stack and stack[-1][0] >= ind:
            stack.pop()
        if stack:
            stack[-1][1]['c'].append(node)
        else:
            tree.append(node)
        stack.append((ind, node))
    root = tree[0]
    rt = re.sub(r'^root\(\((.*)\)\)$', r'\1', root['t'])
    brs = ''
    for br in root['c']:
        leaves = ''
        for lf in br['c']:
            sub = ''.join(f'<span class="mm-sub">{esc(s["t"])}</span>' for s in lf['c'])
            leaves += f'<span class="mm-leaf">{esc(lf["t"])}{sub}</span>'
        brs += f'<li class="mm-br"><span class="mm-bl">{esc(br["t"])}</span><span class="mm-leaves">{leaves}</span></li>'
    html = (f'<figure class="fig" data-added="fig" data-fig="M1"><figcaption class="fig-cap"><span class="fig-no">图解 M1</span><span>原文导图（由上方 Mermaid 源代码渲染）</span></figcaption>'
            f'<div class="mm-wrap"><div class="mm-tree"><span class="mm-root">{esc(rt)}</span><ul class="mm-branches">{brs}</ul></div></div>'
            f'<p class="fig-note">渲染内容与原文 Mermaid 代码逐项一致；断网时同样可以显示。</p></figure>')
    mm_fig.find('div', class_='mermaid-render').append(frag(html))

# ------------------------------------------------------------------ figures
FIGS = {
    # id: (unit, anchor, where)  where: 'after' host of anchor block | 'start' unit start | 'slot:<name>' | 'end'
    'D4': ('s3-2-2', '约3.29倍（+229%）', 'after'),
    'D7': ('s3-2-4', '工业革命的演进概览', 'after'),
    'D6': ('s3-2-4', '的追赶链，是解释', 'after'),
    'D8': ('s3-2-4', '火箭号在竞赛中胜出', 'after'),
    'D5': ('s3-2-5', None, 'end'),
    'D18': ('s3-2-6', '工厂制度及合股制度的运作', 'after'),
    'D10': ('s3-2-6', '英国是首个城市人口过半的社会', 'after'),
    'D15': ('s3-2-6', '英国是首个城市人口过半的社会', 'after2'),
    'D17': ('s3-2-6', '可视为欧洲纺织业发展的转折点', 'after'),
    'D12': ('s3-2-6', '1848—49年疫潮才是英国19世纪最严重的一次', 'after'),
    'D11': ('s3-2-6', '1833年并非第一部工厂法', 'after'),
    'D19': ('s3-2-6', '工业革命后西方国家与殖民地的关系', 'after'),
    'D9': ('s3-3', None, 'start'),
    'D3': ('s4-2', None, 'slot:mermaid-flowchart'),
    'D16': ('s4-6', '领导地位转移', 'after'),
    'D14': ('s5-4', '分时段判断', 'after'),
}
placed = []
last_after = {}
for fid, (uid, anchor, where) in FIGS.items():
    fp = B / 'figs' / f'{fid}.html'
    if not fp.exists():
        log('figure missing', fid)
        continue
    f = frag(fp.read_text(encoding='utf8'))
    fig = f.find('figure')
    if fig is None:
        log('figure malformed', fid); continue
    fig['data-added'] = 'fig'
    note = fig.find('p', class_='fig-note')
    if note is not None:
        note['data-b'] = f'a.fig.{fid}'
    cap = fig.find('figcaption')
    svg = fig.find('svg')
    if svg is not None and svg.has_attr('style') and 'min-width' in svg['style']:
        m = re.search(r'min-width:\s*(\d+)', svg['style'])
        if m and int(m.group(1)) > 700:
            fig['class'] = fig.get('class', []) + ['wide']
    u = unit_el(uid)
    if where == 'start':
        body = u.find('div', class_='unit-body')
        lead = body.find('p', class_='lead', recursive=False)
        (lead.insert_after(fig) if lead else body.insert(0, fig))
    elif where == 'end':
        u.find('div', class_='unit-body').append(fig)
    elif where.startswith('slot:'):
        slot = page.find('div', attrs={'data-slot': where[5:]})
        slot.append(fig)
    else:
        b = find_block(uid, anchor)
        if b is None:
            log('figure anchor not found', fid, anchor); continue
        host = host_for(b)
        key = id(host)
        if where == 'after2' and key in last_after:
            last_after[key].insert_after(fig)
        else:
            nxt = host
            # keep sidenotes/mnemonics attached to the host before the figure
            host.insert_after(fig)
        last_after[key] = fig
    placed.append(fid)

# ------------------------------------------------------------------ flashcards from the original tables
def clean_cell(cell):
    c = BeautifulSoup(str(cell), 'html.parser').find(cell.name)
    for x in c.find_all(True):
        for a in ('data-b', 'id', 'data-ans'):
            if x.has_attr(a):
                del x[a]
    for x in c.find_all('a', class_='ref'):
        x.name = 'span'; del x['href']; x['class'] = ['tag']
        if x.has_attr('title'): del x['title']
    for x in c.find_all('span', class_=['num', 'kw']):
        x.unwrap()
    for x in c.find_all('strong'):
        if x.has_attr('class'): del x['class']
    return c.decode_contents().strip()


def rows_of(tbl):
    heads = [th.get_text().strip() for th in tbl.find('thead').find_all('th')]
    out = []
    for tr in tbl.find('tbody').find_all('tr'):
        out.append((heads, tr.find_all('td')))
    return out


def table_in(uid, contains):
    u = unit_el(uid)
    for t in u.find_all('table'):
        if contains in t.get_text():
            return t
    raise SystemExit(f'table not found {uid} {contains}')


CARDS = []
DECKS = []


def cid(deck, front):
    return deck + '-' + hashlib.md5(front.encode('utf8')).hexdigest()[:8]


def deck(id_, name, uid, contains, front_cols, back_cols, front_tpl=None):
    t = table_in(uid, contains)
    n = 0
    for heads, tds in rows_of(t):
        f = ' ↔ '.join(clean_cell(tds[i]) for i in front_cols)
        if front_tpl:
            f = front_tpl.format(f)
        parts = []
        for i in back_cols:
            if i < len(tds) and tds[i].get_text().strip() not in ('', '—', '-'):
                parts.append(f'<div class="fc-part"><span class="fc-lab">{esc(heads[i])}</span>{clean_cell(tds[i])}</div>')
        if not parts:
            continue
        CARDS.append({'id': cid(id_, f), 'deck': id_, 'unit': uid, 'f': f, 'b': ''.join(parts)})
        n += 1
    DECKS.append({'id': id_, 'name': name, 'n': n})


deck('concept', '核心概念卡（2.3）', 's2-3', '机械化 Mechanisation', [0], [1, 2, 3, 4])
deck('pairs', '必须分清的六组概念（2.4）', 's2-4', '一句话分清', [1, 2], [3], '{}<br><span style="font-size:.8em;font-weight:400">怎样分清？</span>')
deck('w5', '5W1H 简表（2.2）', 's2-2', 'Who 谁', [0], [1, 2])
deck('causes', '欧洲出现工业革命的原因（3.2②）', 's3-2-2', '人口增长', [0], [1, 2])
deck('change', '资料5.44 工业革命前后的转变（3.2④）', 's3-2-4', '工业革命前', [0], [1, 2, 3], '{}<br><span style="font-size:.8em;font-weight:400">工业革命前后有何不同？</span>')
deck('acts', '资料5.54 工厂法（课本＋核查）', 's3-2-6', '1833年工厂法案', [0], [1, 2, 3])
deck('timeline', '详细时间线（3.3）', 's3-3', '关键事件', [0], [1, 2, 3])
deck('sources', '课本资料逐项评价（5.1）', 's5-1', '人口表', [0], [1, 2, 3, 4])
deck('skills', '核心知识—题型（6.1）', 's6-1', '相关设问', [0], [1, 2, 3])
deck('key', '核心考点（6.2）', 's6-2', '必须能说出的内容', [0], [1])
deck('errors', '易错辨析（6.3）', 's6-3', '典型误答', [1], [2, 3], '<span style="font-size:.8em;font-weight:400">典型误答：</span><br>{}<br><span style="font-size:.8em;font-weight:400">错在哪？怎样改？</span>')
deck('years', '必背年份（7.1）', 's7-1', '《垄断法案》', [0], [1])
if QA_CARDS:
    for q in QA_CARDS:
        f = esc(q['q'])
        b = f'<div class="fc-part"><span class="fc-lab">原文</span>{esc(q["a"])}</div><div class="fc-part"><span class="fc-lab">出处</span>{esc(q["src"])}</div>'
        CARDS.append({'id': cid('qa', f), 'deck': 'qa', 'unit': q['unit'], 'f': f, 'b': b, 'qa': True})
    DECKS.append({'id': 'qa', 'name': '要点自测（补充出题，答案为原文）', 'n': len(QA_CARDS)})

# ------------------------------------------------------------------ data + shell
CHAPTERS = []
for cid_, t in ch_titles.items():
    short = t.split('、')[0] + '、' + t.split('、')[1][:8] if '、' in t else t
    CHAPTERS.append({'id': cid_, 'title': t, 'short': t.split('、')[0] + '章'})
UNITS = [{'id': u['id'], 'title': re.sub(r'^🔵\s*', '', u['title']), 'level': u['level']} for u in units if u['id'] != 'top']
DATA = {'topic': TOPIC, 'slug': SLUG, 'units': UNITS, 'chapters': CHAPTERS, 'cards': CARDS, 'decks': DECKS}

ICONS = {
    'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
    'search': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.6 8 3.2 10 2.5 12c1 2.5 4.5 7 9.5 7 1.6 0 3-.4 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    'kw': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4M7 14h10"/><path d="M14 10h3" stroke-dasharray="1 2"/>',
    'hash': '<path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"/>',
    'pen': '<path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="M4 21h9"/>',
    'cards': '<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M8 4h10.5A2 2 0 0 1 20.5 6v10.5"/>',
    'focus': '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    'doc': '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    'sliders': '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    'undo': '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -5)"/>',
    'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    'note': '<path d="M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h5"/>',
    'cal': '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="m9 15 2 2 4-4"/>',
    'check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-sq': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12.5 3 3 5-6"/>',
    'sq': '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    'chev-down': '<path d="m6 9 6 6 6-6"/>',
    'chev-up': '<path d="m6 15 6-6 6 6"/>',
    'code': '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    'swap': '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    'shuffle': '<path d="M3 7h3c4 0 6 10 10 10h4M3 17h3c1.5 0 2.7-1.4 3.7-3.2M14.3 10.2C15.3 8.4 16.5 7 18 7h2M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    'flag': '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    'left': '<path d="m15 6-6 6 6 6"/>',
    'right': '<path d="m9 6 6 6-6 6"/>',
    'download': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    'print': '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
    'bookmark': '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
    'fold': '<path d="M7 4l5 5 5-5M7 20l5-5 5 5"/>',
    'unfold': '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>',
    'bulb': '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
}
sprite = '<svg id="ir-icons" xmlns="http://www.w3.org/2000/svg" style="display:none">' + ''.join(
    f'<symbol id="i-{k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{v}</symbol>' for k, v in ICONS.items()) + '</svg>'


def ico(n):
    return f'<svg aria-hidden="true" viewBox="0 0 24 24"><use href="#i-{n}"></use></svg>'


BRAND = ('<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">'
         '<circle cx="17" cy="20" r="12.5"/><circle cx="17" cy="20" r="3"/>'
         '<path d="M17 7.5v9.5M17 23v9.5M4.5 20H14M20 20h9.5M8.2 11.2l6.7 6.7M19.1 22.1l6.7 6.7M8.2 28.8l6.7-6.7M19.1 17.9l6.7-6.7"/>'
         '<circle cx="34" cy="20" r="3.6"/><path d="M29.5 20h.9"/></svg>')

TOOLS = [('mask-kw', 'key', '遮词', '遮住关键词（点按逐个显示）'), ('mask-num', 'hash', '遮数', '遮住年份和数字（点按逐个显示）'),
         ('pen', 'pen', '荧光笔', '荧光笔模式：选好颜色后，选中文字一松手就上色'), ('cards', 'cards', '闪卡', '闪卡自测'),
         ('focus', 'focus', '专注', '专注模式：隐藏侧栏和工具栏'), ('pure', 'doc', '原文', '纯原文模式：隐藏全部补充内容'),
         ('settings', 'sliders', '设置', '字号、深浅色、备份与恢复')]


def toolbtns():
    out = ''
    for a, i, lab, tip in TOOLS:
        dot = '<span class="pen-dot"></span>' if a == 'pen' else ''
        pressed = '' if a in ('cards', 'settings') else ' aria-pressed="false"'
        out += f'<button class="tbtn" type="button" data-act="{a}" title="{tip}" aria-label="{tip}"{pressed}>{ico(i)}{dot}<span>{lab}</span></button>'
    return out


SHELL_TOP = f'''<div id="app" class="no-js">
<p class="nojs-banner"><strong>当前打开方式不支持互动功能，请用在线版或 Microsoft Edge 打开。</strong>（例如在 iPad“文件”App 里预览时脚本不会运行。）全部原文仍可在下方完整阅读；搜索、荧光笔、遮挡背诵、闪卡、进度与复习提醒需要能运行脚本的浏览器。</p>
<header class="topbar">
<button class="tbtn menu-btn needs-js" type="button" data-act="menu" aria-label="打开目录">{ico('menu')}<span>目录</span></button>
<a class="brand" href="#top" aria-label="回到顶部">{BRAND}<span class="brand-txt"><b>工业革命 · 技术的革新</b><span>STUDY PACK · PP.40—63</span></span></a>
<div class="search needs-js" role="search"><svg class="ico-s" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-search"></use></svg><label class="vh" for="q">搜索全文</label><input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="搜索全文（空格分隔多词）"><button class="clear" type="button" aria-label="清除搜索">{ico('x')}</button><div class="sresults" id="sresults" role="listbox" aria-label="搜索结果"></div></div>
<nav class="tools needs-js" aria-label="学习工具">{toolbtns()}</nav>
</header>
<aside class="sidebar needs-js" id="sidebar" aria-label="目录与索引">
<button class="side-close" type="button" data-act="close-drawer" aria-label="关闭目录">{ico('x')}</button>
<div class="side-top"><div class="progress"><span id="prog-num">已掌握 0 节</span><button class="chip" type="button" data-act="resume" title="回到上次读到的位置">{ico('bookmark')}上次位置</button><div class="bar"><i id="prog-bar"></i></div><span class="due" id="due-count" hidden></span></div></div>
<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true" aria-controls="pane-toc">目录</button><button class="tab" role="tab" aria-selected="false" aria-controls="pane-key">重点<span class="cnt" id="cnt-key"></span></button><button class="tab" role="tab" aria-selected="false" aria-controls="pane-err">易错<span class="cnt" id="cnt-err"></span></button><button class="tab" role="tab" aria-selected="false" aria-controls="pane-hl">荧光笔<span class="cnt" id="cnt-hl"></span></button></div>
<div class="panes">
<div class="pane" id="pane-toc" role="tabpanel"><div class="pane-tools"><button class="chip" type="button" data-act="fold-all">{ico('fold')}全部折叠</button><button class="chip" type="button" data-act="unfold-all">{ico('unfold')}全部展开</button><button class="chip" type="button" data-act="notes" aria-pressed="true">{ico('bulb')}补充解释</button><button class="chip" type="button" data-act="answers" aria-pressed="false">{ico('note')}全部答案</button></div><ul class="toc" id="toc"></ul></div>
<div class="pane" id="pane-key" role="tabpanel" hidden><div id="ix-key"></div></div>
<div class="pane" id="pane-err" role="tabpanel" hidden><div id="ix-err"></div></div>
<div class="pane" id="pane-hl" role="tabpanel" hidden></div>
</div>
</aside>
<div class="scrim needs-js"></div>
<main class="main" id="main">'''

SHELL_BOTTOM = f'''</main>
<nav class="bottombar needs-js" aria-label="学习工具">{toolbtns()}</nav>
<div class="hl-bar needs-js" id="hl-bar" data-ui="1" role="toolbar" aria-label="荧光笔颜色"></div>
<div class="hl-menu needs-js" id="hl-menu" data-ui="1" role="dialog" aria-label="修改标记"></div>
<div class="penstrip needs-js" id="penstrip" data-ui="1"></div>
<div class="modal needs-js" id="modal" data-ui="1"></div>
<div class="toast needs-js" id="toast" data-ui="1" role="status" aria-live="polite"></div>
<div class="focus-tools needs-js" data-ui="1"><button type="button" data-act="pen" aria-pressed="false">{ico('pen')}荧光笔</button><button type="button" data-act="focus">{ico('x')}退出专注</button></div>
<div class="modal needs-js" id="confirm" data-ui="1"></div>
{sprite}
</div>'''

css = (B / 'tpl/tokens.css').read_text(encoding='utf8') + (B / 'tpl/diagram.css').read_text(encoding='utf8') + (B / 'tpl/main.css').read_text(encoding='utf8')
js = (B / 'tpl/app.js').read_text(encoding='utf8')
FONTS = 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Noto+Serif+SC:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
data_json = json.dumps(DATA, ensure_ascii=False).replace('</', '<\\/')

body = SHELL_TOP + str(page) + SHELL_BOTTOM
body += f'\n<script type="application/json" id="ir-data">{data_json}</script>\n<script id="ir-app">{js}</script>\n'

head_common = (f'<title>{TITLE}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
               f'<meta name="description" content="{TOPIC} 深析知识包：原文完整保留，附学习概览、图解、背诵遮挡、荧光笔与闪卡。">\n'
               f'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
               f'<link id="ir-fonts" rel="stylesheet" href="{FONTS}">\n<style id="ir-css">{css}</style>\n')
artifact = head_common + body
full = ('<!doctype html>\n<html lang="zh-Hans">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head_common + '</head>\n<body>\n' + body + '</body>\n</html>\n')
dist = B / 'dist'
dist.mkdir(exist_ok=True)
(dist / 'artifact.html').write_text(artifact, encoding='utf8')
(dist / f'{TOPIC}.html').write_text(full, encoding='utf8')
print('figures placed:', ' '.join(placed))
print('supplements:', counts, '| cards', len(CARDS), 'decks', len(DECKS))
print('size KB', len(full.encode('utf8')) // 1024)
for l in LOG:
    print('LOG', l)
