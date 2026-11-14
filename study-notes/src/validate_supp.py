#!/usr/bin/env python3
"""Validate a supplement JSON file against the source.

Usage: python3 validate_supp.py supp/B.json [more.json ...]

Checks: schema, section ids, anchors (exactly one match inside the section),
numbers (every digit run must occur in the source), quotes/emoji/traditional
characters. Exit code 1 on any error.
"""
import json
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mdparse  # noqa: E402

TYPES = {'gist', 'explain', 'diagram', 'mnemonic', 'conclusion'}
TONES = {'struct', 'base', 'key', 'warn', 'ext', None, ''}
KINDS = {'chain', 'timeline', 'versus', 'layers', 'bars', 'parallel', 'tree', 'cards', 'fork'}

EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⭕]')


def build_units():
    md, tokens, env, raw, conv, changes = mdparse.parse()
    heads = mdparse.outline(tokens)
    head_at = {h['i']: h for h in heads}
    # stack of active heading ids by level
    stack = {}
    units = []  # (text, [ids in scope])
    for i, t in enumerate(tokens):
        if i in head_at:
            h = head_at[i]
            lvl = h['level']
            stack = {k: v for k, v in stack.items() if k < lvl}
            stack[lvl] = h['id']
            continue
        if t.type == 'inline':
            if i > 0 and tokens[i - 1].type == 'heading_open':
                continue
            units.append((mdparse.inline_text(t), list(stack.values())))
        elif t.type in ('fence', 'code_block'):
            units.append((t.content, list(stack.values())))
    ids = {h['id'] for h in heads}
    plain = re.sub(r'<[^>]+>', '', conv)
    return units, ids, plain, heads


def strings_in(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        yield ('%g' % obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in ('basis', 'id', 'anchor', 'section', 'type', 'pos', 'tone', 'kind', 'refs'):
                continue
            yield from strings_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings_in(v)


def check_diagram(d, err, where):
    if not isinstance(d, dict) or d.get('kind') not in KINDS:
        err(where, 'diagram.kind must be one of %s' % sorted(KINDS))
        return
    k = d['kind']

    def need(key, typ):
        if not isinstance(d.get(key), typ):
            err(where, 'diagram(%s) needs "%s" (%s)' % (k, key, typ.__name__))
            return False
        return True

    def tone_ok(x):
        if x.get('tone') not in TONES:
            err(where, 'bad tone %r' % x.get('tone'))

    if k == 'chain':
        if need('steps', list):
            for s in d['steps']:
                if not isinstance(s, dict) or not s.get('t'):
                    err(where, 'chain step needs t')
                else:
                    tone_ok(s)
            labs = d.get('labels')
            if labs is not None and (not isinstance(labs, list) or len(labs) != len(d['steps']) - 1):
                err(where, 'chain.labels must have len(steps)-1 items')
    elif k == 'timeline':
        if need('events', list):
            for e in d['events']:
                if not e.get('date') or not e.get('t'):
                    err(where, 'timeline event needs date and t')
                tone_ok(e)
    elif k == 'versus':
        for side in ('left', 'right'):
            s = d.get(side)
            if not isinstance(s, dict) or not s.get('h') or not isinstance(s.get('items'), list):
                err(where, 'versus.%s needs h and items[]' % side)
            else:
                tone_ok(s)
    elif k == 'layers':
        if need('rows', list):
            for r in d['rows']:
                if not r.get('k') or not r.get('v'):
                    err(where, 'layers row needs k and v')
                tone_ok(r)
    elif k == 'bars':
        if need('items', list):
            for it in d['items']:
                if not it.get('label') or not isinstance(it.get('value'), (int, float)):
                    err(where, 'bars item needs label and numeric value')
                tone_ok(it)
        if not isinstance(d.get('max'), (int, float)):
            err(where, 'bars needs numeric max')
    elif k == 'parallel':
        if need('cols', list) and need('rows', list):
            for r in d['rows']:
                if not r.get('date') or not isinstance(r.get('cells'), list) or len(r['cells']) != len(d['cols']):
                    err(where, 'parallel row needs date and cells matching cols')
    elif k == 'tree':
        def walk(n, depth=0):
            if not isinstance(n, dict) or not n.get('t'):
                err(where, 'tree node needs t')
                return
            for c in n.get('children', []) or []:
                walk(c, depth + 1)
        walk(d.get('root'))
    elif k == 'cards':
        if need('items', list):
            for it in d['items']:
                if not it.get('h'):
                    err(where, 'cards item needs h')
                tone_ok(it)
    elif k == 'fork':
        if not isinstance(d.get('from'), dict) or not d['from'].get('t'):
            err(where, 'fork needs from.t')
        if need('branches', list):
            for b in d['branches']:
                if not b.get('t'):
                    err(where, 'fork branch needs t')
                tone_ok(b)


def main(paths):
    from opencc import OpenCC
    cc = OpenCC('t2s')
    units, ids, plain, heads = build_units()
    plain_nocomma = plain.replace(',', '')
    total_err = 0
    for p in paths:
        errors = []

        def err(where, msg):
            errors.append('%s: %s' % (where, msg))

        data = json.load(open(p, encoding='utf-8'))
        items = data.get('items', [])
        seen = set()
        for n, it in enumerate(items):
            where = it.get('id') or '#%d' % n
            if it.get('id') in seen:
                err(where, 'duplicate id')
            seen.add(it.get('id'))
            ty = it.get('type')
            if ty not in TYPES:
                err(where, 'bad type %r' % ty)
                continue
            sec = it.get('section')
            if sec not in ids:
                err(where, 'unknown section %r' % sec)
                continue
            if ty != 'gist':
                a = it.get('anchor')
                if not a or len(a) < 6:
                    err(where, 'anchor required (>=6 chars)')
                else:
                    if '**' in a or a.startswith('- '):
                        err(where, 'anchor must be plain text without markdown symbols')
                    hits = [u for u in units if sec in u[1] and a in u[0]]
                    if len(hits) != 1:
                        err(where, 'anchor %r matches %d blocks in %s (need exactly 1)' % (a[:30], len(hits), sec))
            if ty in ('gist', 'explain', 'mnemonic') and not (it.get('text') or it.get('verse')):
                err(where, 'text required')
            if ty == 'explain' and not it.get('title'):
                err(where, 'explain needs title (the term)')
            if ty == 'diagram':
                check_diagram(it.get('diagram'), err, where)
                if not it.get('title'):
                    err(where, 'diagram needs title')
            if ty == 'mnemonic':
                if not it.get('verse') or not isinstance(it.get('keys'), list) or not it['keys']:
                    err(where, 'mnemonic needs verse and keys[]')
            if not it.get('basis'):
                err(where, 'basis (supporting quotes) required')
            for s in strings_in(it):
                if any(c in s for c in '「」『』'):
                    err(where, 'use “” not 「」: %s' % s[:30])
                if EMOJI.search(s):
                    err(where, 'no emoji allowed: %s' % s[:30])
                if cc.convert(s) != s:
                    err(where, 'traditional chars: %s' % s[:30])
                for num in re.findall(r'\d[\d,.]*\d|\d', s):
                    numc = num.replace(',', '')
                    if num not in plain and numc not in plain_nocomma:
                        err(where, 'number %r not found in source (no new numbers allowed)' % num)
        ov = data.get('overview')
        if ov:
            for s in strings_in(ov):
                if any(c in s for c in '「」『』') or EMOJI.search(s) or cc.convert(s) != s:
                    err('overview', 'bad chars: %s' % s[:30])
                for num in re.findall(r'\d[\d,.]*\d|\d', s):
                    if num not in plain and num.replace(',', '') not in plain_nocomma:
                        err('overview', 'number %r not in source' % num)
            if ov.get('map'):
                check_diagram(ov['map'], err, 'overview.map')
        print('== %s: %d items, %d errors' % (p, len(items), len(errors)))
        for e in errors:
            print('  -', e)
        total_err += len(errors)
    sys.exit(1 if total_err else 0)


if __name__ == '__main__':
    main(sys.argv[1:])
