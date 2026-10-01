#!/usr/bin/env python3
"""Release regressions: canonical file layout, numeric inputs, card icon scale, UI styling and PWA freshness."""
import asyncio, os, subprocess, tempfile
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
PORT=9016
URL=f'http://127.0.0.1:{PORT}/h3tc-web/'
ART=ROOT/'tests'/'artifacts';ART.mkdir(parents=True,exist_ok=True)

def transforms_script():
    return "Array.from(document.querySelectorAll('.node')).map(n=>n.getAttribute('transform'))"

async def main():
    mount=tempfile.TemporaryDirectory(prefix='h3tc-v151-')
    (Path(mount.name)/'h3tc-web').symlink_to(ROOT,target_is_directory=True)
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',mount.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                if urlopen(URL,timeout=.5).status==200: break
            except OSError: await asyncio.sleep(.1)
        else: raise RuntimeError('Local server did not start')
        async with async_playwright() as p:
            exe=os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None
            browser=await p.chromium.launch(executable_path=exe,args=['--no-sandbox','--disable-dev-shm-usage'])
            context=await browser.new_context(viewport={'width':1440,'height':900},locale='en-US')
            page=await context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
            await page.goto(URL,wait_until='networkidle')
            await page.wait_for_function("()=>document.querySelectorAll('#built-in-select option').length===60")
            await page.locator('#built-in-select').select_option('01')
            await page.wait_for_function("()=>document.querySelectorAll('.node').length===7")
            canonical=await page.evaluate(transforms_script())
            # Opening the exact same file directly must now use the same canonical preset.
            await page.locator('#file-input').set_input_files(str(ROOT/'templates/01-skirmish.txt'))
            await page.wait_for_function("()=>document.querySelectorAll('.node').length===7")
            opened=await page.evaluate(transforms_script())
            assert opened==canonical,(canonical,opened)

            # Numeric schema fields reject letters immediately and still update live.
            await page.locator('.node').first.click()
            field=page.locator('[data-path="base_size"]')
            await field.fill('')
            await field.press_sequentially('12a3')
            await page.wait_for_timeout(50)
            assert await field.input_value()=='123',await field.input_value()
            assert 'S 123' in (await page.locator('.node').first.text_content())

            # The supplied map art is visibly larger than v1.5.0.
            chest=page.locator('.node').first.locator('use.h3-icon-chest')
            assert await chest.get_attribute('width')=='43'
            slot=page.locator('.node .h3-slot use.h3-icon').first
            if await slot.count(): assert await slot.get_attribute('width')=='40'

            # Auto-layout returns the canonical arrangement even after a manual move.
            node=page.locator('.node').first
            box=await node.bounding_box(); assert box
            await page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
            await page.mouse.down();await page.mouse.move(box['x']+box['width']/2+95,box['y']+box['height']/2+60,steps=4);await page.mouse.up()
            moved=await page.evaluate(transforms_script());assert moved!=canonical
            await page.locator('#more-btn').click();await page.locator('#more-menu [data-action="layout"]').click()
            await page.wait_for_timeout(80)
            restored=await page.evaluate(transforms_script());assert restored==canonical,(canonical,restored)

            appearance=await page.locator('#built-in-select').evaluate("e=>getComputedStyle(e).appearance")
            assert appearance=='none',appearance
            await page.screenshot(path=str(ART/'v151-1440.png'))
            assert not errors,errors
            print('PASS: canonical direct-open layout, auto-layout reset, numeric-only live input, enlarged icons and unified select styling.')

            # A stale cached document must never win while the network is available.
            fresh=await context.new_page();await fresh.goto(URL,wait_until='networkidle')
            await fresh.evaluate('''async()=>{const r=await navigator.serviceWorker.ready;const c=await caches.open('h3tc-studio-v1.5.2');
              await c.put('./index.html',new Response('<!doctype html><title>STALE 1.4.3</title><body>STALE 1.4.3</body>',{headers:{'content-type':'text/html'}}));return r.active?.state;}''')
            await fresh.reload(wait_until='networkidle')
            assert await fresh.locator('.statusbar').get_by_text('v1.5.2').count()==1
            assert await fresh.get_by_text('STALE 1.4.3').count()==0
            print('PASS: online reload bypasses stale PWA document cache and reopens v1.5.2.')
            await browser.close()
    finally:
        server.terminate()
        try: server.wait(timeout=3)
        except subprocess.TimeoutExpired: server.kill()
        mount.cleanup()

if __name__=='__main__': asyncio.run(main())
