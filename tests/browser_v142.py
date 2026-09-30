#!/usr/bin/env python3
"""Browser regression for native install UX, readable cards and the filtered legend."""
import asyncio
import os
import subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
PORT=8979
URL=f'http://127.0.0.1:{PORT}/'
ARTIFACTS=ROOT/'tests'/'artifacts'

async def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1',
                             '--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                if urlopen(URL,timeout=.25).status==200:break
            except OSError:await asyncio.sleep(.1)
        else:raise AssertionError('Local test server could not start.')
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
                                            args=['--no-sandbox','--disable-dev-shm-usage'])
            for locale,width,height in [('en-US',1440,900),('ru-RU',390,844),('en-US',320,568)]:
                context=await browser.new_context(locale=locale,viewport={'width':width,'height':height})
                page=await context.new_page()
                errors=[]
                page.on('pageerror',lambda exc:errors.append(str(exc)))
                await page.goto(URL,wait_until='networkidle')
                assert await page.locator('meta[name="mobile-web-app-capable"]').get_attribute('content')=='yes'
                assert await page.locator('#canvas-legend').is_hidden()
                assert await page.locator('html').get_attribute('lang')==('ru' if locale=='ru-RU' else 'en')
                print(f'PASS: first visit {locale}: collapsed/hidden empty legend, supported PWA meta.',flush=True)
                # Select a dense real 33-zone pack for sufficient player, treasure, town and resource symbols.
                await page.locator('#built-in-select').select_option('23')
                await page.wait_for_function('()=>document.querySelectorAll(".node").length===33')
                await page.wait_for_timeout(80)
                legend=page.locator('#canvas-legend')
                assert await legend.is_visible()
                assert not await legend.evaluate('(e)=>e.open'),'Legend must be collapsed by default.'
                await page.locator('#legend-summary').click()
                assert await legend.evaluate('(e)=>e.open')
                actual=await page.evaluate('''() => ({
                    mines:[...new Set([...document.querySelectorAll('.h3-slot-mine')].map(x=>x.dataset.resource.toLowerCase()))],
                    legendIcons:[...document.querySelectorAll('#legend-content .legend-icon use')].map(x=>x.getAttribute('href')),
                    headings:[...document.querySelectorAll('#legend-content h3')].map(x=>x.textContent),
                    cardFonts:[...document.querySelectorAll('.node-treasure,.node-size,.h3-slot-count,.node-id-label')].slice(0,8).map(x=>Number.parseFloat(getComputedStyle(x).fontSize)),
                    chestSize:document.querySelector('.node-head use').getAttribute('width'),
                    menu:document.querySelector('#canvas-legend').getBoundingClientRect().toJSON(),
                    overflow:document.documentElement.scrollWidth>innerWidth+1,
                    totalZones:document.querySelectorAll('.node').length
                })''')
                for resource in actual['mines']:
                    if resource!='airship':assert '#h3-'+resource in actual['legendIcons'],(resource,actual['legendIcons'])
                assert float(actual['chestSize'])>=40,actual
                assert min(actual['cardFonts'])>=14,actual
                assert actual['menu']['right']<=width+1,actual
                assert not actual['overflow'],actual
                assert len(actual['headings'])>=3,actual
                # Every resource in the legend must actually appear on this map; absent
                # resources must not leak in from another pack or from a static list.
                listed=await page.evaluate('''() => {
                  const section=[...document.querySelectorAll('#legend-content .legend-section')]
                    .find(s=>['Resources','Ресурсы'].includes(s.querySelector('h3')?.textContent));
                  return section?[...section.querySelectorAll('.legend-icon use')]
                    .map(el=>el.getAttribute('href').replace('#h3-','')):[];
                }''')
                assert sorted(listed)==sorted([x for x in actual['mines'] if x!='airship']),(listed,actual['mines'])
                assert not errors,errors
                print(f'PASS: {width}x{height} card graphics and locale-filtered legend ({actual["totalZones"]} zones, {len(actual["mines"])} mining symbols).',flush=True)
                await page.screenshot(path=str(ARTIFACTS/f'v142-{width}-legend-{locale[:2]}.png'))
                if width==1440:
                    await page.locator('#language-select').select_option('ru')
                    assert (await page.locator('#legend-heading').inner_text())=='Обозначения'
                    await page.locator('#language-select').select_option('en')
                    assert (await page.locator('#legend-heading').inner_text())=='Legend'
                    print('PASS: expanded legend updates when the language changes.',flush=True)
                # Switching templates closes the legend; sections are regenerated for the selected map only.
                await page.locator('#built-in-select').select_option('51')
                await page.wait_for_function('()=>document.querySelectorAll(".node").length===7')
                await page.wait_for_timeout(120)
                assert not await legend.evaluate('(e)=>e.open')
                print('PASS: switching templates resets the legend to collapsed.',flush=True)
                if width==1440:
                    # A fake event validates that Chrome's native install banner is not suppressed.
                    prevented=await page.evaluate('''() => {
                        const e=new Event('beforeinstallprompt',{cancelable:true});
                        e.prompt=()=>{window.__promptCalled=true};e.userChoice=Promise.resolve({outcome:'accepted'});
                        window.dispatchEvent(e);return e.defaultPrevented;
                    }''')
                    assert prevented is False
                    await page.locator('#install-btn').click()
                    assert await page.evaluate('window.__promptCalled===true')
                    print('PASS: custom Install action works without suppressing the native browser install banner.',flush=True)
                    # Export SVG rendering still includes the embedded artwork.
                    assert await page.locator('.node-head .h3-icon-chest').count()>0
                await context.close()
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':asyncio.run(main())
