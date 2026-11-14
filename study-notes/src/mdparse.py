"""Parse the source markdown into a structured document.

Only three kinds of text change are allowed by the brief:
  繁体→简体 (none needed: OpenCC finds no traditional characters),
  「」→“”, 『』→‘’,
  and layout-only line breaking.
Everything else is kept verbatim. Bold/italic markers are turned into
<strong>/<em> before parsing so CJK flanking rules can never leave stray
asterisks.
"""
import re
from markdown_it import MarkdownIt

SRC = __file__.rsplit('/', 1)[0] + '/source.md'

QUOTE_MAP = {'「': '“', '」': '”', '『': '‘', '』': '’'}


def load_source():
    raw = open(SRC, encoding='utf-8').read()
    conv = ''.join(QUOTE_MAP.get(c, c) for c in raw)
    changes = sum(raw.count(k) for k in QUOTE_MAP)
    return raw, conv, changes


def pre_inline(text):
    """Convert **bold** and *italic* to HTML outside fenced code blocks."""
    out = []
    in_fence = False
    for line in text.split('\n'):
        if line.startswith('```'):
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence and line[:1] and line[:1] in '🔵⚫🟢🔴🟡' and out and out[-1].strip() \
                and not out[-1].startswith('#'):
            # layout-only: give each marked line its own paragraph so it gets its own colour
            out.append('')
        if not in_fence:
            line = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', line)
            line = re.sub(r'(?<![\*\w])\*([^*\n]+?)\*(?![\*\w])', r'<em>\1</em>', line)
        out.append(line)
    return '\n'.join(out)


def make_md():
    md = MarkdownIt('commonmark', {'html': True, 'breaks': True, 'typographer': False})
    md.enable('table')
    return md


def top_blocks(tokens):
    """Split a token stream into top-level blocks: list of (start, end) slices."""
    blocks = []
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if t.nesting == 1:
            depth = 0
            j = i
            while j < n:
                if tokens[j].nesting == 1:
                    depth += 1
                elif tokens[j].nesting == -1:
                    depth -= 1
                if depth == 0:
                    break
                j += 1
            blocks.append((i, j + 1))
            i = j + 1
        else:
            blocks.append((i, i + 1))
            i += 1
    return blocks


def inline_text(tok):
    """Plain text of an inline token (strip html tags)."""
    s = tok.content
    s = re.sub(r'<[^>]+>', '', s)
    return s


def block_plain(tokens, a, b):
    parts = []
    for t in tokens[a:b]:
        if t.type == 'inline':
            parts.append(inline_text(t))
        elif t.type in ('fence', 'code_block'):
            parts.append(t.content)
    return '\n'.join(parts)


HEAD_NUM = re.compile(r'^(?:🔵\s*)?§?(\d+(?:\.\d+)*)\s')


def heading_info(text):
    m = HEAD_NUM.match(text)
    return m.group(1) if m else None


def parse():
    raw, conv, changes = load_source()
    md = make_md()
    src = pre_inline(conv)
    env = {}
    tokens = md.parse(src, env)
    return md, tokens, env, raw, conv, changes


def outline(tokens):
    """Yield heading entries with ids."""
    items = []
    chap = None
    sec = None
    sub_count = {}
    x_count = 0
    for i, t in enumerate(tokens):
        if t.type != 'heading_open':
            continue
        lvl = int(t.tag[1])
        text = inline_text(tokens[i + 1])
        num = heading_info(text)
        if lvl == 1:
            hid = 'top'
        elif lvl == 2:
            hid = 'c' + (num or 'x')
            chap = hid
            sec = None
        elif lvl == 3:
            if num:
                hid = 's' + num.replace('.', '-')
            else:
                x_count += 1
                hid = 's-legend' if '标记' in text else 's-x%d' % x_count
            sec = hid
            sub_count[hid] = 0
        else:
            if num:
                hid = 's' + num.replace('.', '-')
            else:
                sub_count[sec] = sub_count.get(sec, 0) + 1
                hid = '%s-%d' % (sec, sub_count[sec])
        items.append({'i': i, 'level': lvl, 'id': hid, 'text': text, 'num': num,
                      'chap': chap, 'sec': sec if lvl >= 3 else None})
    return items


if __name__ == '__main__':
    md, tokens, env, raw, conv, changes = parse()
    print('quote changes', changes)
    for h in outline(tokens):
        print('  ' * (h['level'] - 1) + h['id'], '|', h['text'])
