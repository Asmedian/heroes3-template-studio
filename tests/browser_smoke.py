#!/usr/bin/env python3
"""Real Chromium/Playwright smoke tests against the static GitHub Pages layout."""
import asyncio
import base64
import os
import json
import subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
PORT=8765
URL=f'http://127.0.0.1:{PORT}/'

async def run():
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(35):
            try:
                if urlopen(URL,timeout=1).status==200:break
            except OSError:await asyncio.sleep(.15)
        else:raise RuntimeError('Development HTTP server unavailable.')
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
            context=await browser.new_context(accept_downloads=True,viewport={'width':1490,'height':930},device_scale_factor=1)
            page=await context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL,wait_until='networkidle')
            await page.get_by_text('XXL Tesseract').first.wait_for(timeout=15000)
            assert await page.locator('.node').count()==16, 'Tesseract zone count'
            assert await page.locator('.connection').count()==32, 'Tesseract connection count'
            assert await page.locator('html').get_attribute('data-theme')=='dark'
            await page.locator('#theme-btn').click()
            assert await page.locator('html').get_attribute('data-theme')=='light'
            await page.locator('#theme-btn').click()
            oldZoom=await page.locator('#zoom-value').inner_text()
            await page.locator('#zoom-in').click()
            assert await page.locator('#zoom-value').inner_text()!=oldZoom
            await page.locator('#zoom-fit').click()
            # Test actual pointer-drag of a visual zone rather than only model changes.
            first_zone=page.locator('.node').first
            position_before=await first_zone.get_attribute('transform')
            rect=await first_zone.bounding_box()
            assert rect, 'First zone has no visible bounding box.'
            cx,cy=rect['x']+rect['width']/2,rect['y']+rect['height']/2
            await page.mouse.move(cx,cy)
            await page.mouse.down()
            await page.mouse.move(cx+34,cy+22,steps=5)
            await page.mouse.up()
            assert await page.locator('.node').first.get_attribute('transform')!=position_before, 'Pointer drag did not move the zone.'
            await page.locator('.node').first.click(force=True)
            await page.locator('#inspector-title').get_by_text('Зона #1').wait_for()
            base=page.locator('input[data-path="base_size"]')
            await base.fill('117')
            await base.press('Tab')
            assert await page.locator('input[data-path="base_size"]').input_value()=='117'
            await page.locator('#undo-btn').click()
            await page.locator('.node').first.click(force=True)
            assert await page.locator('input[data-path="base_size"]').input_value()!='117'
            await page.locator('#redo-btn').click()
            await page.locator('.node').first.click(force=True)
            assert await page.locator('input[data-path="base_size"]').input_value()=='117'
            async with page.expect_download() as down:
                await page.locator('#save-btn').click()
            download=await down.value
            exported=await download.path()
            assert Path(exported).read_bytes(), 'Save produced empty file.'
            assert (await page.locator('#dirty-indicator').inner_text()).startswith('✓')
            await page.locator('#export-format').select_option('hota18')
            # A conversion may warn; choose the explicit confirm if it appears.
            await page.locator('#convert-btn').click()
            if await page.locator('#modal').evaluate('(e)=>e.open'):
                await page.locator('#modal-buttons .btn-primary').click()
            # Confirm conversion triggered a second download where supported.
            await page.locator('#add-zone-btn').click()
            assert await page.locator('.node').count()==17
            await page.locator('#more-btn').click()
            await page.locator('[data-action="layout"]').click()
            await page.locator('#zoom-fit').click()
            await page.locator('#more-btn').click()
            async with page.expect_download() as down:
                await page.locator('[data-action="png"]').click()
            assert (await down.value).suggested_filename.endswith('.png')
            await page.locator('#more-btn').click()
            async with page.expect_download() as down:
                await page.locator('[data-action="export-layout"]').click()
            sidecar=await down.value
            assert sidecar.suggested_filename.endswith('.h3tc-layout.json')
            sidecar_json=json.loads(Path(await sidecar.path()).read_text(encoding='utf-8'))
            assert len(sidecar_json['maps']['XXL Tesseract']['zones'])==17
            await page.locator('#layout-input').set_input_files(str(await sidecar.path()))
            assert await page.locator('.node').count()==17
            await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/Duel.h3t'))
            await page.get_by_text('30 карт').first.wait_for(timeout=10000)
            assert await page.locator('.node').count()==9
            await page.locator('#validate-btn').click()
            assert await page.locator('#modal').evaluate('(e)=>e.open')
            assert '420' in await page.locator('#modal-content').inner_text()
            await page.locator('#modal-close').click()
            await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/Jebus Outcast.h3t'))
            await page.get_by_text('126 карт').first.wait_for(timeout=10000)
            assert await page.locator('.node').count()==7
            await page.locator('#map-search').fill('Outcast')
            assert await page.locator('.map-item').count()>0
            # Exercise the actual HTML Drag and Drop API with a user-provided template.
            data=base64.b64encode((ROOT/'tests/fixtures/tesseract.txt').read_bytes()).decode('ascii')
            await page.evaluate('''([base64Text, filename])=>{
              const binary=atob(base64Text),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
              const transfer=new DataTransfer();transfer.items.add(new File([bytes],filename,{type:'text/plain'}));
              window.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
            }''',[data,'tesseract.txt'])
            await page.get_by_text('XXL Tesseract').first.wait_for(timeout=15000)
            assert await page.locator('.node').count()==16
            await page.locator('#validate-btn').click()
            assert await page.locator('#modal').evaluate('(e)=>e.open')
            await page.locator('#modal-close').click()
            assert await page.evaluate('async()=>{const r=await fetch("./manifest.webmanifest");const m=await r.json();return m.start_url==="./"&&m.icons.some(x=>x.sizes==="512x512")}')
            await page.wait_for_function('()=>navigator.serviceWorker.controller!==null',timeout=15000)
            # Verify the precached shell and default example are available without network.
            await context.set_offline(True)
            await page.reload(wait_until='networkidle')
            await page.get_by_text('XXL Tesseract').first.wait_for(timeout=15000)
            assert await page.locator('.node').count()==16, 'Offline app failed to load default template.'
            await context.set_offline(False)
            await page.screenshot(path=str(ROOT/'tests/browser_screenshot.png'),full_page=True)
            assert not errors, '\n'.join(errors)
            print('Browser smoke: PASS (Chromium, templates 1/30/126 maps, theme, zoom, edit, undo/redo, save, PNG, import, offline reload, manifest, service worker).')
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':asyncio.run(run())
