#!/usr/bin/env python3
"""Synchronize the app, PWA manifest, offline cache, and package version."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"\d+\.\d+\.\d+")

if len(sys.argv) != 2 or not VERSION_PATTERN.fullmatch(sys.argv[1]):
    raise SystemExit("Usage: python scripts/bump_version.py MAJOR.MINOR.PATCH")

version = sys.argv[1]

for name in ("package.json", "manifest.webmanifest"):
    path = ROOT / name
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = version
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8",
    )

service_worker = ROOT / "sw.js"
service_worker.write_text(
    re.sub(
        r"const\s+VERSION\s*=\s*'[^']+';",
        f"const VERSION = '{version}';",
        service_worker.read_text(encoding="utf-8"),
    ),
    encoding="utf-8",
)

html = ROOT / "index.html"
text = html.read_text(encoding="utf-8")
text = re.sub(r"(<span>v)\d+\.\d+\.\d+(</span>)", rf"\g<1>{version}\g<2>", text)
text = re.sub(r"(styles\.css\?v=)\d+\.\d+\.\d+", rf"\g<1>{version}", text)
text = re.sub(
    r'(src="\./src/app\.js\?v=)\d+\.\d+\.\d+(")',
    rf"\g<1>{version}\g<2>",
    text,
)
html.write_text(text, encoding="utf-8")

app = ROOT / "src" / "app.js"
text = app.read_text(encoding="utf-8")
text = re.sub(
    r"(register\('./sw\.js\?v=)\d+\.\d+\.\d+(')",
    rf"\g<1>{version}\g<2>",
    text,
)
app.write_text(text, encoding="utf-8")

print(
    "Synchronized package.json, manifest, sw.js, cache-busting URLs and UI version:",
    version,
)
