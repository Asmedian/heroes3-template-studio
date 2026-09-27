#!/usr/bin/env python3
"""Regenerate browser schema directly from a checked-out upstream h3tc tree."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--upstream-path', required=True, type=Path, help='Path to a checkout of sokie/heroes3-template-util')
parser.add_argument('--output', default=str(ROOT / 'src/schema.json'))
args = parser.parse_args()
sys.path.insert(0, str(Path(args.upstream_path).resolve() / 'src'))
from h3tc.schema import SCHEMAS, build_header_rows  # noqa: E402
from h3tc.constants import ZONE_OPTION_FIELDS, SOD_TO_HOTA_DEFAULTS  # noqa: E402
from h3tc.enums import RESOURCES  # noqa: E402

data = {'upstreamSource': 'sokie/heroes3-template-util', 'schemaVersion': 1,
        'zoneOptionFields': ZONE_OPTION_FIELDS, 'sodToHotaDefaults': SOD_TO_HOTA_DEFAULTS,
        'resources': RESOURCES, 'formats': {}}
for format_id, schema in SCHEMAS.items():
    data['formats'][format_id] = {
        'columns': {k: v for k,v in vars(schema).items() if k.isupper() and isinstance(v,int)},
        'towns': schema.town_factions,
        'monsters': schema.monster_factions,
        'terrains': schema.terrains,
        'isHota': schema.is_hota,
        'headers': build_header_rows(format_id),
    }
payload = json.dumps(data,ensure_ascii=False,separators=(',',':'))
Path(args.output).write_text(payload+'\n',encoding='utf-8')
Path(args.output).with_name('schema-data.js').write_text('export default '+payload+';\n',encoding='utf-8')
print('Exported:', args.output)
for k, v in data['formats'].items():
    print(k, v['columns'].get('TOTAL',v['columns'].get('ACTIVE_COLS')))
