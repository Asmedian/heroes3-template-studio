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

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts'
EXPECTED=json.loads((ROOT/'tests'/'catalog_expectations.json').read_text())
PORT=8777
URL=f'http://127.0.0.1:{PORT}/github-pages-test/'

async def run():
 ARTIFACTS.mkdir(exist_ok=True)
 temp=tempfile.TemporaryDirectory(prefix='h3tc-pages-')
 (Path(temp.name)/'github-pages-test').symlink_to(ROOT,target_is_directory=True)
 server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',temp.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 counters={'templates':0,'maps':0,'zones':0,'connections':0,'mine_icons':0,'blank_maps':0,'screenshots':0,'errors':0}
 try:
  for _ in range(60):
   try:
    if urlopen(URL,timeout=1).status==200:break
   except OSError:await asyncio.sleep(.1)
  else:raise RuntimeError('Local test server not started.')
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,args=['--no-sandbox','--disable-dev-shm-usage'])
   ctx=await browser.new_context(viewport={'width':1440,'height':900},locale='en-US')
   page=await ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(URL,wait_until='domcontentloaded')
   await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60',timeout=20000)
   assert await page.locator('.node').count()==0,'Initial site must have no selected template.'
   assert await page.locator('html').get_attribute('lang')=='en'
   assert await page.locator('#language-select').input_value()=='en'
   assert await page.locator('#built-in-select').evaluate('(e)=>getComputedStyle(e).backgroundColor') != 'rgb(255, 255, 255)', 'Dark select remains white.'
   await page.screenshot(path=str(ARTIFACTS/'release-1440-empty-en-dark.png'))
   counters['screenshots']+=1
   for template in EXPECTED['templates']:
    await page.locator('#built-in-select').select_option(template['id'])
    await page.wait_for_function('(count)=>document.querySelectorAll(".map-item").length===count',arg=len(template['maps']),timeout=20000)
    await page.wait_for_function('()=>!document.querySelector("#built-in-select").disabled')
    assert await page.locator('#built-in-select').input_value()==template['id']
    for i,m in enumerate(template['maps']):
     # Switching with a genuine UI click, including maps whose data contains no zones.
     await page.locator('.map-item').nth(i).evaluate('(button)=>button.click()')
     await page.wait_for_function('([zones,links])=>document.querySelectorAll(".node").length===zones && document.querySelectorAll(".connection").length===links',arg=[m['zones'],m['connections']],timeout=10000)
     seen=await page.evaluate('''() => ({zones:document.querySelectorAll('.node').length,
         connections:document.querySelectorAll('.connection').length,
         mines:document.querySelectorAll('.h3-slot-mine').length,
         players:[...document.querySelectorAll('.node[data-owner]')].map(x=>x.dataset.owner).filter(x=>x!=='0')})''')
     assert seen['zones']==m['zones'] and seen['connections']==m['connections'], (template['name'],i,seen,m)
     assert seen['mines']==m['mines'], f'{template["name"]} map {i} lost mining glyphs: {seen["mines"]} != {m["mines"]}'
     assert seen['players']==m['players'],f'{template["name"]} map {i} player colors mismatch: {seen["players"]} != {m["players"]}'
     counters['maps']+=1;counters['zones']+=seen['zones'];counters['connections']+=seen['connections'];counters['mine_icons']+=seen['mines'];counters['blank_maps']+=int(not m['zones'])
     if template['id'] in ('19','44','47') and i==0:
      await page.screenshot(path=str(ARTIFACTS/f'release-{template["id"]}-en-dark.png'))
      counters['screenshots']+=1
    counters['templates']+=1
    if counters['templates']%10==0:print(f'Catalog progress: {counters["templates"]}/59 bundles and {counters["maps"]}/238 maps',flush=True)
   assert counters['templates']==59 and counters['maps']==238
   assert counters['zones']==2996 and counters['connections']==4285 and counters['blank_maps']==4
   # Card and connection labels shorten only their display text, not original attribute values.
   await page.locator('#built-in-select').select_option('44')
   await page.wait_for_function('()=>document.querySelectorAll(".node").length===5')
   await page.locator('#zoom-fit').click()
   await page.locator('#theme-btn').click()
   assert await page.locator('html').get_attribute('data-theme')=='light'
   await page.screenshot(path=str(ARTIFACTS/'release-jebus-1440-light.png'))
   counters['screenshots']+=1
   await page.locator('#theme-btn').click()
   # Regression: the fifth inspector tab must fit into its container.
   await page.locator('.node').first.click(force=True)
   await page.locator('#inspector-tabs button').last.wait_for()
   metrics=await page.evaluate('''()=>{const b=document.querySelector('#inspector-tabs').getBoundingClientRect();const m=[...document.querySelectorAll('#inspector-tabs button')].at(-1).getBoundingClientRect();return {tabs:document.querySelectorAll('#inspector-tabs button').length,inside:m.left>=b.left-1&&m.right<=b.right+1&&m.bottom<=b.bottom+1};}''')
   assert metrics['tabs']>=5 and metrics['inside'],f'Inspector Monsters tab clipped: {metrics}'
   assert not errors,errors
   # All 59 assets must actually be available from the offline cache on a GitHub Pages subpath.
   await page.wait_for_function('()=>navigator.serviceWorker.controller!==null',timeout=15000)
   cache=await page.evaluate('''async()=>{const catalog=await (await fetch('./samples/catalog.json')).json();const cache=await caches.open((await caches.keys()).find(x=>x.startsWith('h3tc-studio-')));let misses=[];for(const item of catalog.templates){if(!await cache.match('./samples/'+item.file))misses.push(item.file);}return {cacheCount:catalog.count,misses};}''')
   assert cache['cacheCount']==59 and not cache['misses'],f'Missing offline assets: {cache}'
   await ctx.set_offline(True)
   await page.reload(wait_until='domcontentloaded')
   await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
   assert await page.locator('.node').count()==0
   for entry in ('01','44','59'):
    await page.locator('#built-in-select').select_option(entry)
    await page.wait_for_function('()=>!document.querySelector("#built-in-select").disabled')
    assert await page.locator('.map-item').count()>0
   await ctx.set_offline(False)
   assert not errors,errors
   await ctx.close()
   for locale in ('ru-RU','fr-FR'):
    context=await browser.new_context(locale=locale,viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
    mp=await context.new_page()
    await mp.goto(URL,wait_until='domcontentloaded')
    await mp.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
    expected_lang='ru' if locale=='ru-RU' else 'en'
    assert await mp.locator('html').get_attribute('lang')==expected_lang,(locale,expected_lang)
    assert await mp.evaluate('localStorage.getItem("h3tc-language")')==expected_lang
    await mp.locator('#built-in-select').select_option('44')
    await mp.wait_for_function('()=>document.querySelectorAll(".node").length===5')
    await mp.screenshot(path=str(ARTIFACTS/f'release-phone-{expected_lang}-dark.png'))
    counters['screenshots']+=1
    await mp.reload(wait_until='domcontentloaded')
    assert await mp.locator('html').get_attribute('lang')==expected_lang
    await context.close()
   counters['errors']=len(errors)
   await browser.close()
 finally:
  server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill()
  temp.cleanup()
 (ARTIFACTS/'catalog-browser-results.json').write_text(json.dumps(counters,indent=2))
 print('CATALOG BROWSER PASS:',json.dumps(counters),flush=True)

if __name__=='__main__':asyncio.run(run())
