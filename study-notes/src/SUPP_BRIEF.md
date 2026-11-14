# Brief: authoring study supplements for the French Revolution notes page

We are turning a long Chinese study pack (`source_converted.md`, Simplified Chinese, the
student's own revision notes for 中二 History, topic 5D「法国大革命及其历史意义」) into an
interactive single-file study web page. The original text is reproduced in full and is never
changed. On top of it, the page shows **clearly-labelled supplements** ("补充"): short
section gists, difficult-concept explanations, diagrams and memory verses. You write those
supplements as JSON. The build script renders them with a fixed visual kit.

Files (all under `/home/user/deepgemm/study-notes/src/`):
- `source_converted.md` – the source text (read it; anchors must be copied from it).
- `outline.txt` – every heading with its section id (e.g. `s3-2`, `s3-2-4`, `s4-7-1`).
- `validate_supp.py` – run `python3 validate_supp.py supp/<G>.json`; it must print 0 errors.

## Hard rules (the student explicitly demands these)
1. **No new facts.** Every historical fact, name, date, number, place, work, quote or source in a
   supplement must already be in `source_converted.md`. You may only (a) summarise, regroup,
   compare and connect what the source says, and (b) explain the plain meaning of a word or
   concept in general-knowledge terms (e.g. what "君主立宪" means as a word). Do not add
   background you happen to know. The validator rejects any digit string not in the source.
2. **Follow the source's own corrections.** The source often corrects the textbook in 🟡 notes
   (e.g. France formally joined the American war in 1778, not 1775; France declared war on
   Austria first on 1792-04-20; the Tennis Court Oath = “在制定宪法之前绝不解散”, the
   assembly — not the king — makes the constitution; Napoleon proclaimed emperor 1804-05-18,
   crowned 12-02; the bishop in the necklace affair was acquitted). Supplements must use the
   corrected version and must not present anything the source marks 【待查证】 as a fact.
   Keep the source's hedges (【推断】 → say “可推断/原文推断”).
3. **Never replace the original.** A supplement adds a way in (a gist, a picture, a verse); it
   must not paraphrase a whole paragraph. Keep it short.
4. Simplified Chinese only; quotation marks “” and ‘’ (never 「」『』); no emoji; no
   markdown except `**bold**` for 1–3 key words in `text`.
5. Each item needs `basis`: 1–4 short exact quotes from the source (prefix with the § number,
   e.g. `"§3.3: 1789年6月20日，路易十六下令关闭国民议会的会场"`) that support every claim in
   the item, and `refs`: the section numbers shown to the student as “依据：§3.3”.

## Item types
All items live in `{"group": "<G>", "items": [ ... ]}` and need a unique `id` like `"B-07"`.

| type | where it appears | fields |
|---|---|---|
| `gist` | top of a section (right under the heading). “先给结论/总纲”: 1–2 sentences, ≤ 70 汉字, what the student must take away from this section. | `section`, `text` |
| `conclusion` | marks an **existing** conclusion sentence in the source so the page highlights it (e.g. a “据证判断”, “结论”, “小结”, “🔴 结论” line). Use this instead of a gist when the section already states its conclusion. No new text. | `section`, `anchor` |
| `explain` | a margin note beside one paragraph/list item/table cell (“补充解释”). For a hard term, concept or causal link the student may not understand. 1–2 sentences, ≤ 80 汉字. | `section`, `anchor`, `title` (the term), `text` |
| `diagram` | a figure inserted after the anchored block (“图解”). Only when a picture genuinely helps: timeline, causal chain, comparison, layers, data to scale. | `section`, `anchor`, `title`, `diagram` (kit spec below), optional `note` |
| `mnemonic` | a short memory verse (“记忆口诀”) after the anchored block. | `section`, `anchor`, `title`, `verse`, `keys`:[{`k`: the character/word in the verse, `v`: what it stands for}] |

`section` = an id from `outline.txt`. `anchor` = an exact substring (≥ 6 characters, ideally
10–20) of ONE paragraph / list item / table cell inside that section, copied as **plain text**:
drop `**`, `*`, list dashes and table pipes, but keep emoji and 【】 tags if they are inside the
copied span. It must match exactly one block in the section (the validator tells you).

## Diagram kit (`diagram` field)
`tone` ∈ `struct` (blue, structure/stages) · `base` (grey, ordinary fact) · `key` (red, core exam
point) · `warn` (yellow, easily confused / trap / correction) · `ext` (green, extension). Keep
labels short: `t` ≤ 12 汉字, `d` ≤ 32 汉字.

- `chain` – causal chain or sequence, rendered as boxes with arrows (wraps; vertical on phones).
  `{"kind":"chain","steps":[{"t":"","d":"","date":"","tone":""}], "labels":["text on arrow 1", ...]}`
  (`labels` optional; if present length = steps − 1). 3–9 steps.
- `timeline` – dated events on a vertical ruler, optional phase grouping.
  `{"kind":"timeline","events":[{"date":"1789.6.17","t":"","d":"","tone":"","star":true,"phase":"温和阶段"}]}`
- `versus` – two-sided comparison / balance.
  `{"kind":"versus","left":{"h":"","tone":"","items":["",""]},"right":{...},"verdict":"one-line judgement from the source"}`
- `layers` – stacked levels (e.g. long-term → trigger).
  `{"kind":"layers","rows":[{"k":"label","v":"content","tone":""}]}`
- `bars` – numbers drawn to scale (only numbers from the source).
  `{"kind":"bars","unit":"亿法镑","max":6.29,"items":[{"label":"","value":3.15,"note":"50%","tone":""}]}`
- `parallel` – two (or three) aligned tracks by date.
  `{"kind":"parallel","cols":["意大利","德意志"],"rows":[{"date":"1866","cells":["",""]}]}`
- `tree` – hierarchy. `{"kind":"tree","root":{"t":"","children":[{"t":"","children":[]}]}}`
- `cards` – a small grid of parallel items. `{"kind":"cards","items":[{"h":"","d":"","tone":""}]}`
- `fork` – one cause, several different effects.
  `{"kind":"fork","from":{"t":"","d":""},"branches":[{"t":"","d":"","tone":""}]}`

## How much
Quality over quantity. Per group roughly: a `gist` or `conclusion` for every `###` section in
your range (skip only where pointless, e.g. pure reference lists); 8–16 `explain`; the diagrams
listed for your group (drop one if it would not genuinely help, add one only if clearly
valuable); 1–3 `mnemonic`. Do not duplicate items owned by another group.

## Groups
- **A** – `s-legend`, §0, §1, §2, §5, §6, §7 **and the overview** (see below).
  Diagram ideas: §0.2 a chain from “中二课题5” to “2031年文凭试/优化课程” (only facts in §0.2);
  §5.4 one `versus` for 争议二 (继承 vs 破坏) is owned by group C — do not repeat it; you may do
  a `cards` for the four disputes' verdicts in §5.4; §6.5/§6.4 explain 审题 words if useful;
  §7.1 a `cards` or `tree` of the five aspects of the 综合回答 (政治/法律与社会/思想/版图/限制).
  Explain-candidates: 社会解释 vs 修正派, 衰落论/转型, 米利特, 史实与意见, 二手材料/原始史料,
  “用处”与“可信性”, 恩格尔系数(already explained — skip), 仿真题, 教学估评.
  **Overview** (top of page, labelled 补充): add a top-level key
  `"overview": {"question": "<the 导入问题 quoted from §1.3>", "chapters": [{"id":"c0","line":"≤40字 one-line point"}, ... for c0–c7], "keywords": [{"k":"三级会议","q":"三级会议"}, ... 14–20 core terms that exist in the source; q = search query], "map": <one diagram, kind tree or cards: a knowledge map of 主题一~四 + 历史技能 with their key nodes>}`.
- **B** – §3.1, §3.2, §3.3 (background, causes, 1789–1799).
  Diagrams: four causes as `cards` (top of 3.2); 1788 budget `bars` in §3.2 (c) (use the 亿法镑
  figures computed in §4.4: 偿债约3.15、军事约1.57、行政约1.20、宫廷约0.38, 收入5.03, 支出6.29,
  赤字1.26 — all exist in the source); three estates' deputies 303/282/610 with “每级一票 vs
  一人一票” (`bars` or `versus`) near 历史资料题4; a `chain` 1789.5.5 → 8.26 (三级会议开幕 →
  国民议会 → 网球场宣言 → … → 人权宣言); a `timeline` of the six 历史定格 events 1791–1799
  with phases; the diamond-necklace mechanism as a short `chain` (判主教无罪 → 公众怀疑王后 →
  王室威信受损). Mnemonics: the four causes; the 1789 sequence.
- **C** – §3.4, §3.5 (Napoleon, impacts, unification, Americas).
  Diagrams: rise to power `chain` (1799 第一执政 → 1802 终身执政 → 1804 称帝, with the
  5.18/12.2 correction); wars `timeline` 1796–1815 marking the 1808/1812 turning points;
  “革命之子?” `versus` (继承 vs 破坏, evidence from §3.4 and §5.4 争议二, verdict 部分同意);
  `fork` 拿破仑战争 → 自由主义（有意，法典） / 民族主义（非预期，反抗）; 维也纳会议 goals →
  measures → result (`layers` or `cards`), incl. “短期有效、长期失败”; Italy vs Germany
  `parallel` 1859–1871; optionally 1813 vs 1815 map changes (`versus`) from the 🔴 两图对比.
  Mnemonics: war sequence 洛迪→莱茵邦联→半岛→俄罗斯→莱比锡→滑铁卢; unification years.
- **D** – §3.6, §3.7, §3.8, §4 (concept map, Asia, timelines, causation, comparison).
  Diagrams: §3.6 the topic-5 concept map as a `tree` or `chain` (文艺复兴 → 宗教改革 → 科学
  革命 / 启蒙运动 → 法国大革命 → 统一民族国家; 科学革命 → 工业革命 → 新殖民扩张);
  §3.7 Mughal vs Ottoman `versus` (keep to source); §3.8.3 the seven phases `timeline`;
  §3.8.3 “三把尺” `cards`; §4.1 cause `layers` (长期背景 … 导火线, 人物选择); §4.2 criteria A/B/C
  `cards`; §4.3 radicalisation `chain`; §4.6 intended vs unintended impacts (`versus` or `cards`).
  Mnemonics: 三把尺; something for §4.2 or §3.8.4 if natural.

## Verifier role (second agent per group)
Read the author's file and the source. For **every** item: check each claim, name, number and
date against the source (grep it); check it follows the source's corrections; check the anchor
is the right place; check the diagram matches the source exactly (order, dates, labels, tones:
red only for 🔴-type core points, yellow for traps/corrections). Fix or delete anything
unsupported, misleading, duplicated, decorative or too long. Make sure gists really state the
section's takeaway. Then run the validator until 0 errors and save the file in place.
