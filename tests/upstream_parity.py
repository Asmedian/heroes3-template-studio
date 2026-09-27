#!/usr/bin/env python3
"""Compare web-engine parses and conversions field-for-field against upstream Python."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--upstream-path', required=True, type=Path,
                    help='Path to an installed or importable sokie/heroes3-template-util checkout')
args = parser.parse_args()
sys.path.insert(0, str(args.upstream_path.resolve() / 'src'))
from h3tc.parsers.sod import SodParser  # noqa: E402
from h3tc.parsers.hota import HotaParser  # noqa: E402
from h3tc.parsers.hota18 import Hota18Parser  # noqa: E402
from h3tc.converters.sod_to_hota import sod_to_hota  # noqa: E402
from h3tc.converters.hota_to_hota18 import hota_to_hota18  # noqa: E402
from h3tc.converters.hota18_to_hota import hota18_to_hota  # noqa: E402
from h3tc.converters.hota_to_sod import hota_to_sod  # noqa: E402


def first_difference(actual, expected, path='$'):
    if isinstance(actual, dict) and isinstance(expected, dict):
        for key in sorted(actual.keys() | expected.keys()):
            if key not in actual or key not in expected:
                return f'{path}.{key}: missing key (JS={key in actual})'
            if actual[key] != expected[key]:
                return first_difference(actual[key], expected[key], f'{path}.{key}')
    if isinstance(actual, list) and isinstance(expected, list):
        for idx, (a, b) in enumerate(zip(actual, expected)):
            if a != b:
                return first_difference(a, b, f'{path}[{idx}]')
        if len(actual) != len(expected):
            return f'{path}: length JS={len(actual)} upstream={len(expected)}'
    return f'{path}: JS={str(actual)[:160]!r} upstream={str(expected)[:160]!r}'


def compare(actual_file, parser_class, source):
    upstream = parser_class().parse(actual_file)
    assert isinstance(upstream.model_dump(mode='json'), dict)
    js = subprocess.check_output(['node', str(ROOT / 'tests/export_model.mjs'), str(actual_file)], cwd=ROOT)
    actual = json.loads(js)
    reference = upstream.model_dump(mode='json')
    if actual != reference:
        raise AssertionError(f'{actual_file.name}: {first_difference(actual, reference)}')
    print(f'PARSE PASS: {actual_file.name}: {len(upstream.maps)} maps, '
          f'{sum(len(m.zones) for m in upstream.maps)} zones, '
          f'{sum(len(m.connections) for m in upstream.maps)} connections')
    for target in ('sod', 'hota17', 'hota18'):
        if target == source:
            continue
        if source == 'sod':
            py = sod_to_hota(upstream, actual_file.stem)
            if target == 'hota18':
                py = hota_to_hota18(py)
        elif source == 'hota17':
            py = hota_to_hota18(upstream) if target == 'hota18' else hota_to_sod(upstream)
        elif source == 'hota18':
            py = hota18_to_hota(upstream)
            if target == 'sod':
                py = hota_to_sod(py)
        ref = py.model_dump(mode='json')
        js = subprocess.check_output(['node', str(ROOT / 'tests/export_model.mjs'),
                                      str(actual_file), target], cwd=ROOT)
        data = json.loads(js)
        if data != ref:
            raise AssertionError(f'{actual_file.name} → {target}: {first_difference(data, ref)}')
        print(f'CONVERT PASS: {actual_file.name}: {source} → {target}')


for name, source, reader in (
    ('tesseract.txt', 'sod', SodParser),
    ('Duel.h3t', 'hota17', HotaParser),
    ('Jebus Outcast.h3t', 'hota17', HotaParser),
):
    compare(ROOT / 'tests' / 'fixtures' / name, reader, source)

with TemporaryDirectory() as folder:
    # Synthesized from tesseract and enriched with Bulwark; tests reverse conversion.
    hota18 = Path(folder) / 'tesseract18.h3t'
    subprocess.check_call(['node', str(ROOT / 'tests/convert_fixture.mjs'),
                           str(ROOT / 'tests/fixtures/tesseract.txt'), str(hota18)], cwd=ROOT)
    compare(hota18, Hota18Parser, 'hota18')

print('All four input models and all eight conversion directions match upstream Python.')
