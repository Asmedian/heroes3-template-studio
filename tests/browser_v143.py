#!/usr/bin/env python3
"""v1.4.3 browser checks for responsive menus, immediate editing and topology previews."""
import asyncio
import os
import subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts'
ART.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:8997/'

async def main():
    server = subprocess.Popen(['python3', '-m', 'http.server', '8997', '--bind', '127.0.0.1', '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                if urlopen(URL, timeout=.2).status == 200: break
            except OSError: await asyncio.sleep(.1)
        else: raise RuntimeError('Local test server did not start.')
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
                                              args=['--no-sandbox', '--disable-dev-shm-usage'])
            page = await browser.new_page(viewport={'width':1440,'height':900},locale='en-US')
            errors = []
            page.on('pageerror',lambda exc:errors.append(str(exc)))
            response = await page.goto(URL, wait_until='networkidle')
            assert response and 'permissions-policy' not in {k.lower() for k in response.headers}, 'The static app unexpectedly sets Permissions-Policy.'
            assert await page.locator('#canvas-legend .legend-chevron svg').count() == 1
            assert await page.locator('#built-in-select option').count() == 60
            await page.locator('#built-in-select').select_option('11')
            await page.wait_for_function('() => document.querySelectorAll("#map-list .map-item").length===53')
            await page.locator('#map-search').fill('4SM4e')
            await page.locator('#map-list .map-item').first.click()
            await page.wait_for_function('() => document.querySelectorAll(".node").length===12')
            await page.wait_for_timeout(250)
            assert await page.locator('.connection').count() == 15
            await page.screenshot(path=str(ART/'v143-4SM4e-1440-en.png'))
            print('PASS: 4SM4e diagram rendered in Chromium; 12 zones, 15 connections.',flush=True)
            await page.locator('#legend-summary').click()
            assert await page.locator('#canvas-legend').evaluate('(x) => x.open')
            await page.locator('#canvas').dispatch_event('pointerdown', {'pointerId':10, 'pointerType':'mouse', 'button':0, 'clientX':590,'clientY':600})
            await page.locator('#canvas').dispatch_event('pointerup', {'pointerId':10, 'pointerType':'mouse', 'button':0, 'clientX':590,'clientY':600})
            assert not await page.locator('#canvas-legend').evaluate('(x) => x.open')
            print('PASS: legend opens and closes upon outside pointer-down.',flush=True)
            node = page.locator('.node').first
            await node.click(force=True)
            field = page.locator('#inspector-body [data-path="base_size"]')
            assert await field.count() == 1
            original = await page.locator('.node.selected .node-size').text_content()
            await field.focus()
            await field.fill('123')
            await page.wait_for_timeout(80)
            modified = await page.locator('.node.selected .node-size').text_content()
            assert modified != original and '123' in modified,(original,modified)
            print('PASS: inspector input updates displayed zone size immediately without blur.',flush=True)
            await field.blur()
            await page.wait_for_timeout(120)
            assert await page.locator('#undo-btn').is_enabled()
            await page.locator('#undo-btn').click()
            assert original == await page.locator('.node.selected .node-size').text_content()
            print('PASS: one undo restores the original value after live typing.',flush=True)
            # The same layout detector also handles an uploaded, unconfigured SoD hypercube.
            await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/tesseract.txt'))
            await page.wait_for_function('() => document.querySelectorAll(".node").length===16')
            await page.wait_for_timeout(150)
            assert await page.locator('.connection').count()==32
            await page.screenshot(path=str(ART/'v143-tesseract-1440-en.png'))
            print('PASS: Tesseract loaded from user fixture, with 16 zones and 32 connections.',flush=True)
            assert not errors, errors
            await page.close()
            # Mobile: all custom disclosures close on outside tap.
            for width,height in [(390,844),(320,568),(900,900)]:
                mobile = await browser.new_page(viewport={'width':width,'height':height},locale='ru-RU',is_mobile=width<=390,has_touch=width<=390)
                mobile_errors=[]
                mobile.on('pageerror',lambda exc:mobile_errors.append(str(exc)))
                await mobile.goto(URL,wait_until='networkidle')
                await mobile.locator('#built-in-select').select_option('44')
                await mobile.wait_for_function('() => document.querySelectorAll(".node").length===5')
                await mobile.locator('#legend-summary').click()
                assert await mobile.locator('#canvas-legend').evaluate('(x)=>x.open')
                await mobile.locator('#canvas').dispatch_event('pointerdown', {'pointerId':22,'pointerType':'touch','clientX':width//2,'clientY':height//2})
                assert not await mobile.locator('#canvas-legend').evaluate('(x)=>x.open')
                if width<=390:
                    await mobile.locator('#sidebar-toggle').click()
                    assert 'open' in (await mobile.locator('#sidebar').get_attribute('class'))
                    await mobile.locator('#canvas').dispatch_event('pointerdown',{'pointerId':25,'pointerType':'touch','clientX':width//2,'clientY':height//2})
                    assert 'open' not in (await mobile.locator('#sidebar').get_attribute('class'))
                assert not mobile_errors, mobile_errors
                await mobile.screenshot(path=str(ART/f'v143-ui-{width}.png'))
                print(f'PASS: {width}x{height} mobile/tablet disclosure and screen layout.',flush=True)
                await mobile.close()
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=4)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':asyncio.run(main())
