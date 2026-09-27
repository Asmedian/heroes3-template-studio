import asyncio,os,subprocess,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    server=subprocess.Popen(['python3','-m','http.server','8911','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(1)
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE'),args=['--no-sandbox','--disable-dev-shm-usage'])
            for lang in ['en-US','ru-RU']:
                page=await browser.new_page(viewport={'width':1440,'height':900},locale=lang)
                page.on('pageerror',lambda e:print('JS ERROR:',e))
                page.on('console',lambda e:print('CONSOLE:',e.text) if e.type=='error' else None)
                await page.goto('http://127.0.0.1:8911/',wait_until='networkidle')
                await page.locator('.node').first.wait_for(timeout=15000)
                print('Language:',lang, 'html:',await page.locator('html').get_attribute('lang'),
                    'nodecount:',await page.locator('.node').count(),
                    'first node:',(await page.locator('.node').first.get_attribute('data-owner')),
                    'title:',await page.locator('#map-title').inner_text(),
                    'open:',await page.locator('#open-btn').inner_text(),
                    'first SVG:',(await page.locator('.node').first.inner_html())[:400])
                await page.screenshot(path=str(ROOT/'tests'/'artifacts'/('visual-'+lang+'.png')))
                await page.close()
            await browser.close()
    finally:server.terminate();server.wait()
asyncio.run(main())
