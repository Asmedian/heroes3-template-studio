#!/usr/bin/env python3
"""Real Chromium regression over all supplied built-in template maps and PWA assets."""

import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
EXPECTED = json.loads((ROOT / 'tests' / 'catalog_expectations.json').read_text())
PORT = 8777
URL = f'http://127.0.0.1:{PORT}/github-pages-test/'


async def wait_server():
    for _ in range(60):
        try:
            if urlopen(URL, timeout=1).status == 200:
                return
        except OSError:
            await asyncio.sleep(.1)
    raise RuntimeError('Local test server not started.')


async def run():
    ARTIFACTS.mkdir(exist_ok=True)
    temp = tempfile.TemporaryDirectory(prefix='h3tc-pages-')
    (Path(temp.name) / 'github-pages-test').symlink_to(ROOT, target_is_directory=True)
    server = subprocess.Popen(
        ['python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', temp.name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    counters = {
        'templates': 0,
        'maps': 0,
        'zones': 0,
        'source_connections': 0,
        'rendered_connections': 0,
        'hidden_invalid_connections': 0,
        'mine_icons': 0,
        'blank_maps': 0,
        'screenshots': 0,
        'errors': 0,
    }

    try:
        await wait_server()
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
                args=['--no-sandbox', '--disable-dev-shm-usage'],
            )
            context = await browser.new_context(viewport={'width': 1440, 'height': 900}, locale='en-US')
            page = await context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))

            await page.goto(URL, wait_until='domcontentloaded')
            await page.wait_for_function(
                '()=>document.querySelectorAll("#built-in-select option").length===60',
                timeout=20000,
            )
            assert await page.locator('.node').count() == 0, 'Initial site must have no selected template.'
            assert await page.locator('html').get_attribute('lang') == 'en'
            assert await page.locator('#language-select').input_value() == 'en'
            assert (
                await page.locator('#built-in-select').evaluate('(e)=>getComputedStyle(e).backgroundColor')
                != 'rgb(255, 255, 255)'
            ), 'Dark select remains white.'
            await page.screenshot(path=str(ARTIFACTS / 'release-1440-empty-en-dark.png'))
            counters['screenshots'] += 1

            for template in EXPECTED['templates']:
                await page.locator('#built-in-select').select_option(template['id'])
                await page.wait_for_function(
                    '(count)=>document.querySelectorAll(".map-item").length===count',
                    arg=len(template['maps']),
                    timeout=20000,
                )
                await page.wait_for_function('()=>!document.querySelector("#built-in-select").disabled')
                assert await page.locator('#built-in-select').input_value() == template['id']

                for index, expected_map in enumerate(template['maps']):
                    # Switching with a genuine UI click, including templates whose source data has no zones.
                    await page.locator('.map-item').nth(index).evaluate('(button)=>button.click()')
                    await page.wait_for_function(
                        '([zones,links])=>document.querySelectorAll(".node").length===zones '
                        '&& document.querySelectorAll(".connection").length===links',
                        arg=[expected_map['zones'], expected_map['renderedConnections']],
                        timeout=10000,
                    )
                    seen = await page.evaluate(
                        """() => ({
                            zones: document.querySelectorAll('.node').length,
                            connections: document.querySelectorAll('.connection').length,
                            mines: document.querySelectorAll('.h3-slot-mine').length,
                            players: [...document.querySelectorAll('.node[data-owner]')]
                                .map(node => node.dataset.owner)
                                .filter(owner => owner !== '0')
                        })"""
                    )

                    assert seen['zones'] == expected_map['zones'], (template['name'], index, seen, expected_map)
                    assert seen['connections'] == expected_map['renderedConnections'], (
                        template['name'], index, seen, expected_map
                    )
                    assert seen['mines'] == expected_map['mines'], (
                        f'{template["name"]} template {index} lost mining glyphs: '
                        f'{seen["mines"]} != {expected_map["mines"]}'
                    )
                    assert seen['players'] == expected_map['players'], (
                        f'{template["name"]} template {index} player colors mismatch: '
                        f'{seen["players"]} != {expected_map["players"]}'
                    )

                    counters['maps'] += 1
                    counters['zones'] += seen['zones']
                    counters['source_connections'] += expected_map['connections']
                    counters['rendered_connections'] += seen['connections']
                    counters['hidden_invalid_connections'] += (
                        expected_map['connections'] - expected_map['renderedConnections']
                    )
                    counters['mine_icons'] += seen['mines']
                    counters['blank_maps'] += int(not expected_map['zones'])

                    if template['id'] in ('19', '44', '47') and index == 0:
                        await page.screenshot(path=str(ARTIFACTS / f'release-{template["id"]}-en-dark.png'))
                        counters['screenshots'] += 1

                counters['templates'] += 1
                if counters['templates'] % 10 == 0:
                    print(
                        f'Catalog progress: {counters["templates"]}/59 bundles '
                        f'and {counters["maps"]}/238 templates',
                        flush=True,
                    )

            assert counters['templates'] == 59 and counters['maps'] == 238
            assert counters['zones'] == 2996
            assert counters['source_connections'] == 4285
            assert counters['rendered_connections'] == 4230
            assert counters['hidden_invalid_connections'] == 55
            assert counters['blank_maps'] == 4

            # Card and connection labels shorten only display text, not original values.
            await page.locator('#built-in-select').select_option('44')
            await page.wait_for_function('()=>document.querySelectorAll(".node").length===5')
            await page.locator('#zoom-fit').click()
            await page.locator('#theme-btn').click()
            assert await page.locator('html').get_attribute('data-theme') == 'light'
            await page.screenshot(path=str(ARTIFACTS / 'release-jebus-1440-light.png'))
            counters['screenshots'] += 1
            await page.locator('#theme-btn').click()

            # Regression: the fifth inspector tab must fit into its container.
            await page.locator('.node').first.click(force=True)
            await page.locator('#inspector-tabs button').last.wait_for()
            metrics = await page.evaluate(
                """()=>{
                    const box = document.querySelector('#inspector-tabs').getBoundingClientRect();
                    const last = [...document.querySelectorAll('#inspector-tabs button')]
                        .at(-1).getBoundingClientRect();
                    return {
                        tabs: document.querySelectorAll('#inspector-tabs button').length,
                        inside: last.left >= box.left - 1 && last.right <= box.right + 1 && last.bottom <= box.bottom + 1
                    };
                }"""
            )
            assert metrics['tabs'] >= 5 and metrics['inside'], f'Inspector Monsters tab clipped: {metrics}'
            assert not errors, errors

            # All 59 assets must be available from the offline cache on a GitHub Pages subpath.
            await page.wait_for_function('()=>navigator.serviceWorker.controller!==null', timeout=15000)
            cache = await page.evaluate(
                """async()=>{
                    const catalog = await (await fetch('./templates/catalog.json')).json();
                    const cache = await caches.open(
                        (await caches.keys()).find(name => name.startsWith('h3tc-studio-'))
                    );
                    const misses = [];
                    for (const item of catalog.templates) {
                        if (!await cache.match('./templates/' + item.file)) {
                            misses.push(item.file);
                        }
                    }
                    return {cacheCount: catalog.count, misses};
                }"""
            )
            assert cache['cacheCount'] == 59 and not cache['misses'], f'Missing offline assets: {cache}'

            await context.set_offline(True)
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
            assert await page.locator('.node').count() == 0
            for entry in ('01', '44', '59'):
                await page.locator('#built-in-select').select_option(entry)
                await page.wait_for_function('()=>!document.querySelector("#built-in-select").disabled')
                assert await page.locator('.map-item').count() > 0
            await context.set_offline(False)
            assert not errors, errors
            await context.close()

            for locale in ('ru-RU', 'fr-FR'):
                mobile_context = await browser.new_context(
                    locale=locale,
                    viewport={'width': 390, 'height': 844},
                    is_mobile=True,
                    has_touch=True,
                    device_scale_factor=2,
                )
                mobile_page = await mobile_context.new_page()
                await mobile_page.goto(URL, wait_until='domcontentloaded')
                await mobile_page.wait_for_function(
                    '()=>document.querySelectorAll("#built-in-select option").length===60'
                )
                expected_language = 'ru' if locale == 'ru-RU' else 'en'
                assert await mobile_page.locator('html').get_attribute('lang') == expected_language, (
                    locale, expected_language
                )
                assert await mobile_page.evaluate('localStorage.getItem("h3tc-language")') == expected_language
                await mobile_page.locator('#built-in-select').select_option('44')
                await mobile_page.wait_for_function('()=>document.querySelectorAll(".node").length===5')
                await mobile_page.screenshot(
                    path=str(ARTIFACTS / f'release-phone-{expected_language}-dark.png')
                )
                counters['screenshots'] += 1
                await mobile_page.reload(wait_until='domcontentloaded')
                assert await mobile_page.locator('html').get_attribute('lang') == expected_language
                await mobile_context.close()

            counters['errors'] = len(errors)
            await browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        temp.cleanup()

    (ARTIFACTS / 'catalog-browser-results.json').write_text(json.dumps(counters, indent=4))
    print('CATALOG BROWSER PASS:', json.dumps(counters), flush=True)


if __name__ == '__main__':
    asyncio.run(run())
