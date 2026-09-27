#!/usr/bin/env python3
"""Extended real-browser tests: PWA installability, mobile gestures, editing, performance."""
import asyncio
import json
import os
import subprocess
import time
import tempfile
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts'
PORT=8767
URL=f'http://127.0.0.1:{PORT}/h3tc-web/'

async def run():
    ARTIFACTS.mkdir(exist_ok=True)
    # Serve a realistic repository subpath without relying on the checkout directory name.
    temp_mount=tempfile.TemporaryDirectory(prefix='h3tc-pages-')
    (Path(temp_mount.name)/'h3tc-web').symlink_to(ROOT,target_is_directory=True)
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',temp_mount.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    results=[]
    async def trial(name,operation):
        try:
            output=await operation()
            results.append({'name':name,'status':'PASS','detail':output})
            print('PASS:',name,output if output is not None else '',flush=True)
        except Exception as exc:
            results.append({'name':name,'status':'FAIL','detail':str(exc)})
            print('FAIL:',name,str(exc),flush=True)
    try:
        for _ in range(60):
            try:
                if urlopen(URL,timeout=1).status==200:break
            except OSError:await asyncio.sleep(.1)
        else:raise RuntimeError('Development server unavailable.')
        async with async_playwright() as p:
            # Full Chromium is required for reliable Chrome DevTools touch gestures.
            full_chrome=os.environ.get('PLAYWRIGHT_FULL_CHROMIUM_EXECUTABLE')
            browser=await p.chromium.launch(channel='chromium' if not full_chrome else None,executable_path=full_chrome or None,args=['--no-sandbox','--disable-dev-shm-usage'])
            ctx=await browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
            page=await ctx.new_page()
            errors=[]
            page.on('pageerror',lambda exc:errors.append(str(exc)))
            await page.goto(URL,wait_until='networkidle')
            await page.locator('.node').first.wait_for()
            async def pwa():
                session=await ctx.new_cdp_session(page)
                manifest=await session.send('Page.getAppManifest')
                parsed=json.loads(manifest['data'])
                assert not manifest.get('errors'), manifest.get('errors')
                assert parsed['name']=='Heroes III Template Studio'
                assert parsed['start_url']=='./' and parsed['scope']=='./'
                assert parsed['display']=='standalone' and any(i.get('sizes')=='512x512' for i in parsed['icons'])
                reg=await page.evaluate('''async()=>{const r=await navigator.serviceWorker.ready;
                  return {scope:r.scope,active:r.active?.state,cache:await caches.keys()};}''')
                assert reg['scope'].endswith('/h3tc-web/') and reg['active']=='activated',reg
                assert any('h3tc-studio-v' in x for x in reg['cache']),reg
                return {'manifest':parsed['name'],'scope':reg['scope'],'cache':reg['cache']}
            await trial('PWA manifest, icons, subdirectory scope and service worker',pwa)
            async def install():
                await page.evaluate('''()=>{window.__install_called=false;
                    const e=new Event('beforeinstallprompt',{cancelable:true});
                    e.prompt=()=>{window.__install_called=true};
                    e.userChoice=Promise.resolve({outcome:'accepted'});
                    window.dispatchEvent(e);
                }''')
                await page.locator('#install-btn').click()
                await page.wait_for_function('()=>window.__install_called===true')
                assert 'устанавливается' in (await page.locator('#toast').inner_text()).lower()
                return 'deferred install event was consumed by the install button'
            await trial('Install button triggers browser install prompt',install)
            async def theme():
                await page.locator('#theme-btn').click()
                assert await page.locator('html').get_attribute('data-theme')=='light'
                await page.reload(wait_until='domcontentloaded')
                await page.locator('.node').first.wait_for()
                assert await page.locator('html').get_attribute('data-theme')=='light'
                await page.locator('#theme-btn').click()
                return 'theme persists after refresh'
            await trial('Theme persistence across reload',theme)
            async def zoompan():
                await page.locator('#zoom-fit').click()
                cv=await page.locator('#canvas').bounding_box()
                center={'x':cv['x']+cv['width']*.6,'y':cv['y']+cv['height']*.65}
                transform0=await page.locator('#canvas-content').get_attribute('transform')
                await page.mouse.move(center['x'],center['y'])
                await page.mouse.wheel(0,-240)
                await page.wait_for_timeout(75)
                transform1=await page.locator('#canvas-content').get_attribute('transform')
                assert transform1!=transform0,(transform0,transform1)
                await page.mouse.move(cv['x']+cv['width']*.75,cv['y']+cv['height']*.88)
                await page.mouse.down()
                await page.mouse.move(cv['x']+cv['width']*.75+37,cv['y']+cv['height']*.88+31,steps=5)
                await page.mouse.up()
                transform2=await page.locator('#canvas-content').get_attribute('transform')
                assert transform2!=transform1,(transform1,transform2)
                await page.locator('#zoom-fit').click()
                return {'wheel_zoom':transform1,'pan':transform2}
            await trial('Mouse-wheel zoom at cursor and drag-to-pan',zoompan)
            async def connections():
                before=await page.locator('.connection').count()
                await page.locator('#add-conn-btn').click()
                first=await page.locator('.node').nth(0).bounding_box()
                second=await page.locator('.node').nth(1).bounding_box()
                for r in (first,second):
                    await page.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
                assert await page.locator('.connection').count()==before+1, 'Connection creation failed.'
                await page.keyboard.press('Control+z')
                assert await page.locator('.connection').count()==before, 'Undo shortcut failed.'
                await page.keyboard.press('Control+y')
                assert await page.locator('.connection').count()==before+1, 'Redo shortcut failed.'
                await page.locator('#undo-btn').click()
                return 'two-click link, Ctrl+Z and Ctrl+Y succeeded'
            await trial('Create links and keyboard undo/redo',connections)
            async def png_export():
                import io
                from PIL import Image
                await page.locator('#more-btn').click()
                async with page.expect_download() as png_download:
                    await page.locator('[data-action="png"]').click()
                saved=await png_download.value
                payload=Path(await saved.path()).read_bytes()
                assert payload.startswith(b'\x89PNG\r\n\x1a\n')
                image=Image.open(io.BytesIO(payload))
                assert image.width>=500 and image.height>=350,(image.width,image.height)
                colors=image.convert('RGB').resize((60,40)).getcolors(maxcolors=2400)
                assert colors and len(colors)>10, 'PNG may be empty or monochrome.'
                return {'dimensions':f'{image.width}x{image.height}','size_bytes':len(payload),'color_count':len(colors)}
            await trial('PNG download decodes into a nonempty drawing',png_export)
            async def corrupt():
                bad=ARTIFACTS/'invalid-template.txt'
                bad.write_text('This is not a Heroes 3 template.\n',encoding='utf-8')
                await page.locator('#file-input').set_input_files(str(bad))
                await page.locator('#modal-title').get_by_text('Ошибка открытия').wait_for()
                await page.locator('#modal-close').click()
                assert await page.locator('.node').count()==16, 'Malformed file replaced current map.'
                return 'clear error and unchanged current template'
            await trial('Malformed input and data preservation',corrupt)
            async def big():
                started=time.perf_counter()
                await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/Jebus Outcast.h3t'))
                await page.get_by_text('126 карт').first.wait_for(timeout=20000)
                read_ms=round((time.perf_counter()-started)*1000)
                assert await page.locator('.map-item').count()==126
                timing=await page.evaluate('''()=>{
                    const start=performance.now();
                    for(let i=0;i<126;i++){
                      const button=document.querySelectorAll('.map-item')[i];
                      if(!button)throw new Error('Map '+i+' missing during navigation');
                      button.click();
                    }
                    return performance.now()-start;
                }''')
                assert await page.locator('.map-item.active').count()==1
                assert await page.locator('.node').count()>0
                assert timing<30000,f'126-map interaction stalled: {timing}ms'
                return {'loaded_ms':read_ms,'switch_126_maps_ms':round(timing)}
            await trial('Large Jebus: import and switch through 126 maps',big)
            async def hota_conversion():
                await page.locator('#export-format').select_option('hota18')
                async with page.expect_download(timeout=60000) as download:
                    await page.locator('#convert-btn').click()
                    if await page.locator('#modal').evaluate('(e)=>e.open'):
                        await page.locator('#modal-buttons .btn-primary').click()
                saved=await download.value
                data=Path(await saved.path()).read_bytes()
                assert saved.suggested_filename.lower().endswith('.h3t')
                assert len(data)>100000
                return {'filename':saved.suggested_filename,'bytes':len(data)}
            await trial('Jebus conversion to HotA 1.8 downloads full template',hota_conversion)
            async def offline():
                await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/tesseract.txt'))
                await page.locator('.node').first.wait_for()
                await page.wait_for_function('()=>navigator.serviceWorker.controller!==null',timeout=10000)
                await ctx.set_offline(True)
                await page.reload(wait_until='domcontentloaded')
                await page.locator('.node').first.wait_for(timeout=12000)
                assert await page.locator('.node').count()==16
                await ctx.set_offline(False)
                return 'nested GitHub Pages path loads from cache offline'
            await trial('PWA offline reload at a nested GitHub Pages URL',offline)
            await ctx.close()
            mobile=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
            mpage=await mobile.new_page()
            mpage.on('pageerror',lambda exc:errors.append(str(exc)))
            await mpage.goto(URL,wait_until='networkidle')
            await mpage.locator('.node').first.wait_for()
            cdp=await mobile.new_cdp_session(mpage)
            async def pinch():
                await mpage.locator('#zoom-fit').click()
                box=await mpage.locator('#canvas').bounding_box()
                y=int(box['y']+min(90,box['height']*.20))
                p1=(95,y);p2=(275,y)
                def point(p,id):return {'x':p[0],'y':p[1],'id':id,'radiusX':5,'radiusY':5,'force':1}
                before=await mpage.locator('#zoom-value').inner_text()
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(p1,1)]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(p1,1),point(p2,2)]})
                for step in range(1,9):
                    a=(p1[0]-step*6,y);b=(p2[0]+step*6,y)
                    await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[point(a,1),point(b,2)]})
                    await asyncio.sleep(.02)
                after=await mpage.locator('#zoom-value').inner_text()
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[point(a,1)]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                assert int(after.rstrip('%'))>int(before.rstrip('%')),f'Pinch zoom did not increase: {before} -> {after}'
                await mpage.screenshot(path=str(ARTIFACTS/'phone-pinch-zoom.png'))
                return f'pinch-to-zoom: {before} -> {after}'
            await trial('Real two-finger mobile pinch zoom (Chrome CDP)',pinch)
            async def touchdrag():
                await mpage.locator('#zoom-fit').click()
                await mpage.locator('#zoom-in').click()
                await mpage.locator('#zoom-in').click()
                box=await mpage.locator('#canvas').bounding_box()
                pos1=await mpage.locator('#canvas-content').get_attribute('transform')
                x=int(box['x']+min(80,box['width']*.2));y=int(box['y']+min(100,box['height']*.2))
                def tp(x,y):return {'x':x,'y':y,'id':3,'force':1}
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[tp(x,y)]})
                for offset in range(5,51,5):
                    await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[tp(x+offset,y+offset)]})
                await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                pos2=await mpage.locator('#canvas-content').get_attribute('transform')
                assert pos1!=pos2,'Touch panning did not change canvas transform.'
                return {'before':pos1,'after':pos2}
            await trial('Mobile single-finger pan',touchdrag)
            async def mobile_edit():
                await mpage.locator('#zoom-fit').click()
                await mpage.locator('#zoom-in').click()
                await mpage.locator('#zoom-in').click()
                node=mpage.locator('.node').first
                box=await node.bounding_box()
                assert box
                await mpage.touchscreen.tap(box['x']+box['width']/2,box['y']+box['height']/2)
                await mpage.locator('#inspector-title').get_by_text('Зона #1').wait_for()
                await mpage.locator('input[data-path="base_size"]').fill('123')
                await mpage.locator('input[data-path="base_size"]').press('Tab')
                await mpage.locator('#inspector-close').click()
                assert await mpage.locator('input[data-path="base_size"]').input_value()=='123'
                return 'touch-selected node, edited properties, closed inspector'
            await trial('Mobile touch selection, field editing, close inspector',mobile_edit)
            await mobile.close()
            assert not errors,f'Uncaught JS errors: {errors}'
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()
        temp_mount.cleanup()
        (ARTIFACTS/'interaction-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    passed=sum(r['status']=='PASS' for r in results)
    print(f'EXTENDED BROWSER: {passed}/{len(results)} PASS',flush=True)
    if passed!=len(results):raise SystemExit(1)

if __name__=='__main__':asyncio.run(run())
