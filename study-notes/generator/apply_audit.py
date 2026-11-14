"""Apply the independent audit (wf_6856e1ef-c43) to supp.json: 7 corrections, 24 deletions of redundant items."""
import json
d = json.load(open('supp.json', encoding='utf8'))
DEL_NOTES = {('s3-2-4', '往复与旋转运动'), ('s3-3', '往复运动与旋转运动'), ('s3-3', '分离冷凝器'), ('s3-2-4', '一次能源与能量载体'),
             ('s3-2-5', '比重与绝对量'), ('s3-2-5', '百分点与相对增幅'), ('s4-2', '解释模型'), ('s3-2-2', '同期不等于因果'),
             ('s3-2-2', '共通条件与英国因素'), ('s3-2-1', '“示意”资料怎样用'), ('s4-1', '触发点'), ('s6-5-2', '解释题与同意题'),
             ('s6-5-1', '比重与绝对值'), ('s6-5-5', '“革命”是否名副其实'), ('s4-6', '漫画的用处与局限')}
DEL_MN = [('s2-2', '机器动，工业兴，城市长'), ('s2-2', '纺能煤，交通医'), ('s2-2', '人多贸广，商投科用'), ('s2-2', '煤铁加殖民，圈地出人手，专利配学会'),
          ('s3-2-5', '一看标题二看时'), ('s6-5-4', '能源添电油'), ('s6-5-3', '资源煤铁，市场殖民')]
DEL_LEAD = {'s7-3'}
NOTE_FIX = {
    ('s3-2-4', '去工业化'): (None, '去工业化指一地原有工业衰落、地位下降。原文以印度为例：印度占世界工业产出的比重由1750年约四分之一跌至1900年约2%，其原因有争议。'),
    ('s3-4', '后期起点两说'): ('后期起点说法不一', '课本定在19世纪中叶，常见分法定在1870年代，史学界的分界并不统一。本节亦指出，钢与电力等新技术的普及要到1870年代至20世纪初。'),
    ('s4-6', '煤仍最重要'): (None, '后期虽新增电力与石油，但到1900年煤仍约占全球能源的47%，石油所占甚小；电力与石油只是“起步”，煤炭贯穿两期。'),
    ('s6-3', '比重与绝对量'): (None, '比重下降可能只因总量增长更快。按原始数据，人力畜力的能量约增至2.2倍，但煤炭约增至43倍，所以前者占比仍大跌。'),
    ('s7-6', '宪章运动的性质'): (None, '《人民宪章》六点要求全是政治改革，没有加薪或缩短工时等经济要求；课本把支持者的经济诉求与宪章正式内容混在一起，作答时若把宪章运动写成“加薪运动”便会失分。'),
}
LEAD_FIX = {'s6-5-2': '阶级A是资产阶级（资本家）、阶级B是工人阶级（无产阶级）；解释“严重社会不平等”须用漫画的对比线索并解释象征，再以个人所知对照两个阶级的差距，限度只宜一两句。'}
MN_FIX = [('s3-2-4', '技＝技术革命（约1750年代展开：发明珍妮纺纱机）', '技＝技术革命（约1750年代展开：发明珍妮纺纱机；珍妮纺纱机实为1764年，“1750年代”只是阶段的大约起点）')]

done = {'del_note': 0, 'del_mn': 0, 'del_lead': 0, 'fix': 0}
for g in d['groups']:
    r = g['result']
    keep = []
    for n in r.get('notes', []):
        k = (n['unit'], n['term'])
        if k in DEL_NOTES:
            done['del_note'] += 1; continue
        if k in NOTE_FIX:
            t, txt = NOTE_FIX[k]
            if t: n['term'] = t
            n['text'] = txt; done['fix'] += 1
        keep.append(n)
    r['notes'] = keep
    keep = []
    for m in r.get('mnemonics', []):
        if any(m['unit'] == u and m['text'].startswith(p) for u, p in DEL_MN):
            done['del_mn'] += 1; continue
        for u, old, new in MN_FIX:
            if m['unit'] == u and old in m['mapping']:
                m['mapping'] = m['mapping'].replace(old, new); done['fix'] += 1
        keep.append(m)
    r['mnemonics'] = keep
    for s in r.get('sections', []):
        if s['id'] in DEL_LEAD and s.get('lead'):
            s['lead'] = ''; done['del_lead'] += 1
        if s['id'] in LEAD_FIX:
            s['lead'] = LEAD_FIX[s['id']]; done['fix'] += 1
json.dump(d, open('supp.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(done)
