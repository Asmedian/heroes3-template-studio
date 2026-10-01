#!/usr/bin/env python3
"""Synchronize the app, PWA manifest, offline cache, and package version."""
import json
import re
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2 or not re.fullmatch(r'\d+\.\d+\.\d+',sys.argv[1]):
    raise SystemExit('Usage: python scripts/bump_version.py MAJOR.MINOR.PATCH')
version=sys.argv[1]
for name in ('package.json','manifest.webmanifest'):
    path=root/name
    data=json.loads(path.read_text(encoding='utf-8'))
    data['version']=version
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sw=root/'sw.js'
sw.write_text(re.sub(r"const VERSION='[^']+';",f"const VERSION='{version}';",sw.read_text(encoding='utf-8')),encoding='utf-8')
html=root/'index.html'
text=html.read_text(encoding='utf-8')
text=re.sub(r'(<span>v)\d+\.\d+\.\d+(</span>)',rf'\g<1>{version}\g<2>',text)
text=re.sub(r'(styles\.css\?v=)\d+\.\d+\.\d+',rf'\g<1>{version}',text)
text=re.sub(r'(src="\./src/app\.js\?v=)\d+\.\d+\.\d+(")',rf'\g<1>{version}\g<2>',text)
html.write_text(text,encoding='utf-8')
app=root/'src'/'app.js'
text=app.read_text(encoding='utf-8')
text=re.sub(r"(register\('./sw\.js\?v=)\d+\.\d+\.\d+(')",rf'\g<1>{version}\g<2>',text)
app.write_text(text,encoding='utf-8')
print('Synchronized package.json, manifest, sw.js, cache-busting URLs and UI version:',version)
