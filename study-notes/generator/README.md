# 工业革命（技术的革新）学习网页：生成脚本

成品：`../工业革命（技术的革新）.html`（单文件，断网可用）。

重新生成：

```
python3 convert.py   # source.md → out/original.html（原文，只做「」→“”、甚么→什么与排版）
python3 build.py     # 套模板、加补充（supp.json）、图解（figs/）、闪卡 → dist/
python3 check_complete.py source.md "dist/工业革命（技术的革新）.html" .page   # 原文完整性核对
```

依赖：`pip install markdown-it-py beautifulsoup4 lxml`；测试脚本（test/）用 Playwright。
