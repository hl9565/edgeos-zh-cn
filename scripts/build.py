"""Build the self-contained userscript using only this repository's files."""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
version = json.loads((BASE / 'package.json').read_text())['version']
repository = 'https://github.com/hl9565/edgeos-zh-cn'
download = 'https://raw.githubusercontent.com/hl9565/edgeos-zh-cn/main/dist/edgeos-zh-cn.user.js'
header = f'''// ==UserScript==
// @name         EdgeOS 3 中文助手
// @namespace    local.edgeos.zh-cn
// @version      {version}
// @description  针对 EdgeOS 3.0.1 的本地界面汉化。保留配置值与 CLI；脚本自身不发网络请求。
// @homepageURL  {repository}
// @supportURL   {repository}/issues
// @downloadURL  {download}
// @updateURL    {download}
// @license      MIT
// @match        https://192.168.1.1/*
// @match        http://192.168.1.1/*
// @run-at       document-end
// @noframes
// @grant        none
// ==/UserScript==

'''
engine = (BASE / 'src/engine.js').read_text()
for placeholder, filename in [('__DICTIONARY__', 'ui.json'), ('__TREE_LABELS__', 'tree-names.json'), ('__TREE_HELP__', 'tree-help.json')]:
    translations = json.loads((BASE / 'locales' / filename).read_text())
    engine = engine.replace(placeholder, json.dumps(translations, ensure_ascii=False, indent=2))
destination = BASE / 'dist'
destination.mkdir(exist_ok=True)
script = header + engine
(destination / 'edgeos-zh-cn.user.js').write_text(script)
(destination / f'edgeos-zh-cn-v{version}.user.js').write_text(script)
print(f'Built EdgeOS Chinese userscript v{version}: {len(script.encode())} bytes')
