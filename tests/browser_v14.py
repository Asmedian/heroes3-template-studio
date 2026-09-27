#!/usr/bin/env python3
"""Regression checks for v1.4 UI, supplied art, invalid uploads and responsive inspector."""
import asyncio
import json
import os
import subprocess
import tempfile
from urllib.request import urlopen
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts';ART.mkdir(exist_ok=True)
URL='http://127.0.0.1:8991/project/'

async def run():
    results=[]
    temp=tempfile.TemporaryDirectory(prefix='h3tc-v14-')
    (Path(temp.name)/'project').symlink_to(ROOT,target_is_directory=True)
    server=subprocess.Popen(['python3','-m','http.server','8991','--bind','127.0.0.1','--directory',temp.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(65):
            try:
                if urlopen(URL,timeout=.5).status==200:break
            except OSError:await asyncio.sleep(.1)
        else:raise RuntimeError('Test server did not start')
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
            try:
                page=await browser.new_page(locale='en-US',viewport={'width':1440,'height':900})
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await page.goto(URL,wait_until='networkidle')
                await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
                assert await page.locator('.node').count()==0
                assert await page.locator('#inspector-context-tabs button').count()==1
                assert 'Map properties' in await page.locator('#inspector-context-tabs').inner_text()
                results.append('Empty start: permanent Map properties tab')
                await page.locator('#built-in-select').select_option('44')
                await page.wait_for_function('()=>document.querySelectorAll(".node").length===5')
                await page.locator('.node[data-owner="1"]').first.click(force=True)
                ctx=page.locator('#inspector-context-tabs')
                assert await ctx.locator('button').count()==2
                assert 'Map properties' in await ctx.inner_text()
                assert 'Zone' in await ctx.inner_text()
                assert 'Zone' in await page.locator('#inspector-title').inner_text()
                await ctx.locator('button[data-inspector-view="map"]').click()
                assert 'Map properties' in await page.locator('#inspector-title').inner_text()
                assert await page.locator('.node.selected').count()==1
                await ctx.locator('button[data-inspector-view="selection"]').click()
                assert 'Zone' in await page.locator('#inspector-title').inner_text()
                await page.locator('.connection').first.click(force=True)
                assert 'Connection' in await ctx.inner_text()
                await ctx.locator('button[data-inspector-view="map"]').click()
                assert 'Map properties' in await page.locator('#inspector-title').inner_text()
                results.append('Map / Zone / Connection header tabs preserve selection and edit target')
                art=await page.evaluate('''() => ({player:getComputedStyle(document.querySelector('.node[data-owner="1"] .node-border')).fill,
                gold:getComputedStyle(document.querySelector('.node[data-owner="0"][data-richness="high"] .node-border')).fill,
                assets:[...document.querySelectorAll('.sprite symbol[id^="h3-"]')].map(x=>x.id)})''')
                assert art['player']=='rgb(230, 77, 77)',art['player']
                assert 'zone-gold' in art['gold'],art['gold']
                assert all(x in art['assets'] for x in ['h3-chest','h3-wood','h3-mercury','h3-ore','h3-sulfur','h3-crystal','h3-gems','h3-gold','h3-fort-1','h3-village-1'])
                results.append('Exact player red, one gold gradient, eight supplied raster symbols and buildings')
                await page.locator('#file-input').set_input_files({'name':'not-a-template.png','mimeType':'image/png','buffer':bytes.fromhex('89504e470d0a1a0a0000000d4948445200010100')})
                await page.locator('dialog#modal[open]').wait_for()
                message=await page.locator('#modal-content').inner_text()
                assert 'Unsupported file type' in message,message
                assert 'IHDR' not in message,message
                assert await page.locator('.node').count()==5
                await page.locator('#modal-close').click()
                # A binary image disguised as .txt is rejected before the parser.
                await page.locator('#file-input').set_input_files({'name':'fake.txt','mimeType':'text/plain','buffer':bytes.fromhex('89504e470d0a1a0a0000000d4948445200010100')})
                await page.locator('dialog#modal[open]').wait_for()
                message=await page.locator('#modal-content').inner_text()
                assert 'binary data' in message,message
                await page.locator('#modal-close').click()
                results.append('Wrong extension and binary PNG disguised as TXT show readable messages and preserve map')
                # Toolbar must be on a second row and available with the properties panel open.
                await page.set_viewport_size({'width':900,'height':700})
                await page.locator('.node').first.click(force=True)
                metrics=await page.evaluate('''() => {
                  const r=s=>document.querySelector(s).getBoundingClientRect();
                  return {heading:r('.map-heading').bottom,actionTop:r('.editor-actions').top,actionRight:r('.editor-actions').right,
                    editorRight:r('.editor-main').right,inspectorTop:r('#inspector').top,toolbarBottom:r('.editor-toolbar').bottom};}''')
                assert metrics['actionTop']>=metrics['heading']-2,metrics
                assert metrics['actionRight']<=metrics['editorRight']+2,metrics
                assert metrics['inspectorTop']>=metrics['toolbarBottom']-2,metrics
                for id in ['add-zone-btn','add-conn-btn','undo-btn','redo-btn','more-btn']:
                    assert await page.locator('#'+id).is_visible(),id
                await page.screenshot(path=str(ART/'v14-tablet-900-editor.png'))
                results.append('900px: toolbar row two remains outside overlay inspector')
                # Test phone-specific brand, language control, mobile drawer outside-click.
                await page.set_viewport_size({'width':390,'height':844})
                assert await page.locator('.brand-short').is_visible()
                assert (await page.locator('.brand-short').inner_text())=='H3 TS'
                lang=await page.locator('#language-select').bounding_box();assert lang and lang['x']+lang['width']<=390
                await page.locator('#sidebar-toggle').click()
                assert 'open' in (await page.locator('#sidebar').get_attribute('class')).split()
                await page.locator('.editor-toolbar').click(position={'x':320,'y':5},force=True)
                assert 'open' not in (await page.locator('#sidebar').get_attribute('class')).split()
                await page.wait_for_timeout(300)
                await page.screenshot(path=str(ART/'v14-phone-390.png'))
                results.append('390px: H3 TS label, fully visible language selector and outside-tap drawer dismissal')
                assert not errors,errors
                print('V1.4 REGRESSIONS: '+str(len(results))+'/'+str(len(results))+' PASS')
                for item in results:print('PASS:',item)
                (ART/'v14-regression.json').write_text(json.dumps({'checks':results,'console_errors':errors},indent=2))
            finally:await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()
        temp.cleanup()

if __name__=='__main__':asyncio.run(run())
