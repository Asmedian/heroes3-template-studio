#!/usr/bin/env python3
"""Responsive Chromium E2E tests with screenshot artifacts and layout diagnostics."""
import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 8766
URL = f'http://127.0.0.1:{PORT}/h3tc-web/'
ARTIFACTS = ROOT/'tests'/'artifacts'
VIEWPORTS = [
    ('desktop-2560', 2560, 1440, False),
    ('desktop-1920', 1920, 1080, False),
    ('desktop-1440', 1440, 900, False),
    ('laptop-1366', 1366, 768, False),
    ('laptop-1024', 1024, 768, False),
    ('tablet-portrait', 768, 1024, True),
    ('tablet-landscape', 1024, 768, True),
    ('phone-430', 430, 932, True),
    ('phone-390', 390, 844, True),
    ('phone-375', 375, 812, True),
    ('phone-360', 360, 800, True),
    ('phone-320', 320, 568, True),
    ('phone-landscape', 812, 375, True),
]

async def geometry(page):
    return await page.evaluate('''() => {
      const pick = s => {
        const e = document.querySelector(s), r = e.getBoundingClientRect(), c = getComputedStyle(e);
        return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
                right:Math.round(r.right),bottom:Math.round(r.bottom),visible:c.display!=='none' && c.visibility!=='hidden'};
      };
      const selectors = ['.app-header','.file-actions','#open-btn','#save-btn','#export-format','#convert-btn',
        '#install-btn','#theme-btn','#language-select','#sidebar-toggle','.editor-main','.editor-toolbar','#map-title',
        '#add-zone-btn','#add-conn-btn','#more-btn','#canvas','#zoom-in','#zoom-out','#zoom-fit',
        '.canvas-top-info','.statusbar','#inspector'];
      const els = Object.fromEntries(selectors.map(s => [s,pick(s)]));
      return {screen:innerWidth+'x'+innerHeight,documentWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,els};
    }''')

async def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    # A fixed test-only mount mimics GitHub Pages regardless of checkout folder name.
    temp_mount = tempfile.TemporaryDirectory(prefix='h3tc-pages-')
    (Path(temp_mount.name)/'h3tc-web').symlink_to(ROOT,target_is_directory=True)
    server = subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',temp_mount.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    failures=[]
    metrics=[]
    passed=0
    def check(ok, msg):
        nonlocal passed
        if ok: passed+=1
        else: failures.append(msg)
    try:
        for _ in range(60):
            try:
                if urlopen(URL,timeout=1).status==200: break
            except OSError: await asyncio.sleep(.1)
        else: raise RuntimeError('Local server unavailable')
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
            for name,width,height,mobile in VIEWPORTS:
                if os.environ.get('H3TC_VIEWPORT_FILTER') and os.environ['H3TC_VIEWPORT_FILTER'] not in name: continue
                context=await browser.new_context(locale='ru-RU',viewport={'width':width,'height':height},device_scale_factor=2 if mobile else 1,
                    is_mobile=mobile,has_touch=mobile,accept_downloads=True)
                page=await context.new_page()
                errors=[]
                page.on('pageerror',lambda exc:errors.append(str(exc)))
                try:
                    await page.goto(URL,wait_until='domcontentloaded')
                    await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
                    assert await page.locator('.node').count()==0, 'Nonblank initial canvas'
                    await page.locator('#file-input').set_input_files(str(ROOT/'tests/fixtures/tesseract.txt'))
                    await page.locator('.node').first.wait_for(timeout=18000)
                    compact_case=width<=650 or (mobile and height<500)
                    if compact_case:
                        await page.locator('#built-in-select').select_option('44')
                        await page.wait_for_function('()=>document.querySelectorAll(".node").length===5')
                    await page.wait_for_timeout(200)
                    measure=await geometry(page)
                    metrics.append({'viewport':name,'device':f'{width}x{height}','mobile':mobile,**measure})
                    check(measure['documentWidth']<=width+1,f'{name}: horizontal page overflow {measure["documentWidth"]}>{width}')
                    check(measure['els']['#canvas']['h']>=100,f'{name}: canvas height <100 px ({measure["els"]["#canvas"]["h"]})')
                    for selector in ['#open-btn','#save-btn','#export-format','#convert-btn','#install-btn','#theme-btn','#language-select','#zoom-in','#zoom-out','#zoom-fit','#add-zone-btn','#add-conn-btn','#more-btn']:
                        el=measure['els'][selector]
                        check(el['w']>=15 and el['h']>=24 and el['x']>=-1 and el['right']<=width+1 and el['y']>=-1 and el['bottom']<=height+1,
                            f'{name}: {selector} clipped/offscreen: {el}')
                    check(not errors,f'{name}: JavaScript errors: {errors}')
                    await page.screenshot(path=str(ARTIFACTS/f'{name}-dark.png'))
                    await page.locator('#theme-btn').click()
                    check(await page.locator('html').get_attribute('data-theme')=='light',f'{name}: light theme did not activate')
                    await page.screenshot(path=str(ARTIFACTS/f'{name}-light.png'))
                    await page.locator('#zoom-in').click()
                    check(int((await page.locator('#zoom-value').inner_text()).rstrip('%'))>0,f'{name}: zoom not updated')
                    await page.locator('#zoom-fit').click()
                    if width<=650:
                        await page.locator('#sidebar-toggle').click()
                        check('open' in (await page.locator('#sidebar').get_attribute('class')).split(), f'{name}: mobile sidebar not opened')
                        await page.locator('#map-search').fill('Jebus')
                        check(await page.locator('.map-item').count()==1,f'{name}: sidebar search failed')
                        await page.wait_for_timeout(250)
                        await page.screenshot(path=str(ARTIFACTS/f'{name}-sidebar.png'))
                        await page.locator('.map-item').first.click()
                        await page.locator('#zoom-fit').click()
                    # Test a fully visible node rather than assuming zone #1 is onscreen
                    # after deliberate initial readable-zoom on compact screens.
                    cv=await page.locator('#canvas').bounding_box()
                    visible_index=await page.evaluate('''() => {
                      const c=document.querySelector('#canvas').getBoundingClientRect();
                      return [...document.querySelectorAll('.node')].findIndex(n=>{
                        const r=n.getBoundingClientRect();return r.width>=8&&r.height>=8&&
                        r.left>=c.left+3&&r.top>=c.top+68&&r.right<=c.right-3&&r.bottom<=c.bottom-62;
                      });
                    }''')
                    node=page.locator('.node').nth(visible_index) if visible_index>=0 else page.locator('.node').first
                    r=await node.bounding_box()
                    if visible_index>=0 and r and cv and r['width']>=8 and r['height']>=10 and r['x']>=cv['x'] and r['y']>=cv['y'] and r['x']+r['width']<=cv['x']+cv['width'] and r['y']+r['height']<=cv['y']+cv['height']:
                        cx,cy=r['x']+r['width']/2,r['y']+r['height']/2
                        if mobile: await page.touchscreen.tap(cx,cy)
                        else: await page.mouse.click(cx,cy)
                        check('open' in (await page.locator('#inspector').get_attribute('class')).split(),f'{name}: inspector did not open after node select')
                        await page.wait_for_timeout(250)
                        await page.screenshot(path=str(ARTIFACTS/f'{name}-inspector.png'))
                        if width<=970:
                            close=page.locator('#inspector-close')
                            check(await close.count()==1 and await close.is_visible(),f'{name}: no visible inspector close button')
                            if await close.count()==1 and await close.is_visible():
                                await close.click()
                                check('open' not in (await page.locator('#inspector').get_attribute('class')).split(),f'{name}: inspector did not close')
                    else:
                        failures.append(f'{name}: first node not fully within canvas (node={r}, canvas={cv})')
                    check(not errors,f'{name}: JavaScript errors after interactions: {errors}')
                except Exception as exc:
                    failures.append(f'{name}: EXCEPTION: {exc}')
                    try: await page.screenshot(path=str(ARTIFACTS/f'{name}-failed.png'))
                    except Exception: pass
                finally:
                    print(f'{name}: {"PASS" if not any(x.startswith(name+":") for x in failures) else "FAIL"}',flush=True)
                    await context.close()
            await browser.close()
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill()
        temp_mount.cleanup()
    result={'passed_checks':passed,'failed_checks':len(failures),'failures':failures,
        'viewports':[{k:v for k,v in m.items() if k not in ('els',)} for m in metrics],
        'element_metrics':metrics}
    (ARTIFACTS/'responsive-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'CHECKS: {passed} pass, {len(failures)} fail, {len(metrics)} viewports')
    for failure in failures: print('FAIL:',failure)
    if failures: raise SystemExit(1)

if __name__=='__main__': asyncio.run(main())
