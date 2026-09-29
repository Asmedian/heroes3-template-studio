#!/usr/bin/env python3
"""Real-browser checks for topological arrangements and multi-edge rendering."""
import asyncio
import os
import subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts'
ART.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:9015/'

async def wait_for_count(page,selector,count):
    await page.wait_for_function('(args) => document.querySelectorAll(args[0]).length === args[1]', arg=[selector,count])

async def main():
    server=subprocess.Popen(['python3','-m','http.server','9015','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(70):
            try:
                if urlopen(URL,timeout=.2).status==200:break
            except OSError:await asyncio.sleep(.1)
        else:raise RuntimeError('Local test server did not start.')
        async with async_playwright() as playwright:
            browser=await playwright.chromium.launch(executable_path=os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
            for width,height in [(1440,900),(900,900),(390,844)]:
                page=await browser.new_page(viewport={'width':width,'height':height},locale='en-US',is_mobile=width==390,has_touch=width==390)
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                await page.goto(URL,wait_until='networkidle')
                if width==390: await page.locator('#sidebar-toggle').click()
                await page.locator('#built-in-select').select_option('11')
                await wait_for_count(page,'#map-list .map-item',53)
                await page.locator('#map-search').fill('4SM4e')
                await page.locator('#map-list .map-item').first.click()
                await wait_for_count(page,'.node',12)
                assert await page.locator('.connection').count()==15
                assert await page.locator('.node').count()==12
                if width==390: await page.locator('#sidebar-toggle').click()
                await page.screenshot(path=str(ART/f'v150-4sm4e-{width}.png'))
                if width==390:
                    assert not errors, errors
                    print('PASS: 390x844 graph and mobile layout; browser errors 0.',flush=True)
                    await page.close()
                    continue
                # Existing source rows remain individually editable; no extra lines are synthesized.
                await page.locator('#map-search').fill('')
                await page.locator('#built-in-select').select_option('48')
                await page.wait_for_function('() => document.querySelectorAll("#map-list .map-item").length>=50')
                # Index 49 of Midnight Mix contains four connections between the same two zones.
                maps=page.locator('#map-list .map-item')
                assert await maps.count()>=50
                await maps.nth(49).click()
                await page.wait_for_function("""() => document.querySelectorAll('.connection[data-parallel-count="4"]').length >= 8""")
                parallel=page.locator('.connection[data-parallel-count="4"]')
                paths=await parallel.locator('path.conn-line').evaluate_all('(els) => els.map(e => e.getAttribute("d"))')
                assert len(set(paths))>=4
                source_indices=await parallel.evaluate_all('(els) => els.map(e => e.dataset.connIndex)')
                assert len(source_indices)==len(set(source_indices))
                assert not errors,errors
                await page.screenshot(path=str(ART/f'v150-multiedge-{width}.png'))
                if width==1440:
                    for _ in range(4): await page.locator('#zoom-in').click()
                    await page.screenshot(path=str(ART/'v150-multiedge-closeup.png'))
                print(f'PASS: {width}x{height} graph, separate four-lane connections, browser errors 0.',flush=True)
                await page.close()
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=4)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':asyncio.run(main())
