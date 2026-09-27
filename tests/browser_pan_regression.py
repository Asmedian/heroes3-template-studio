#!/usr/bin/env python3
"""Chromium regression checks for responsive SVG panning and card contrast."""
import asyncio
import json
import os
import subprocess
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
PORT=8976
URL=f'http://127.0.0.1:{PORT}/'

async def main():
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1',
                             '--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                if urlopen(URL,timeout=.2).status==200:break
            except OSError: await asyncio.sleep(.1)
        else:raise AssertionError('Test server did not start.')
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
                                            args=['--no-sandbox','--disable-dev-shm-usage'])
            ctx=await browser.new_context(locale='en-US',viewport={'width':1440,'height':900})
            page=await ctx.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL,wait_until='networkidle')
            await page.locator('#built-in-select').select_option('23')
            await page.wait_for_function('()=>document.querySelectorAll(".node").length===33')
            assert await page.locator('.node-type-hint').count()==0
            print('PASS: No obsolete node-type-hint on any of the 33 zones.',flush=True)
            # All bright card categories must use dark sword strokes in dark mode.
            styles=await page.evaluate('''() => {
              const contrast={};const sword=document.querySelector('.node .h3-icon-swords');
              const theme=document.documentElement;
              for(const [owner,richness,color] of [['1','low','#263344'],['0','mid','#263344'],['0','high','#263344'],['0','low','#e5edf7']]){
                const card=document.createElementNS('http://www.w3.org/2000/svg','g');
                card.classList.add('node');card.setAttribute('data-owner',owner);card.setAttribute('data-richness',richness);
                const sword=document.createElementNS('http://www.w3.org/2000/svg','use');sword.classList.add('h3-icon-swords');card.append(sword);
                document.getElementById('canvas').append(card);
                contrast[owner+'/'+richness]={actual:getComputedStyle(sword).color,expected:color};card.remove();
              }
              return {contrast,silver:!!document.querySelector('#zone-silver'),gold:!!document.querySelector('#zone-gold')};
            }''')
            for kind,value in styles['contrast'].items():
                from_ = value['expected']; actual=value['actual']
                rgb=tuple(int(from_[i:i+2],16) for i in (1,3,5))
                assert actual==f'rgb({rgb[0]}, {rgb[1]}, {rgb[2]})',(kind,value)
            assert styles['silver'] and styles['gold']
            print('PASS: Dark-theme swords remain visible on light player/silver/gold cards; light on dark neutral cards.',flush=True)
            cv=await page.locator('#canvas').bounding_box()
            x=cv['x']+65;y=cv['y']+cv['height']*.65
            start=await page.locator('#canvas-content').get_attribute('transform')
            await page.mouse.move(x,y);await page.mouse.down()
            perf=await page.evaluate('''({x,y}) => {
              const canvas=document.getElementById('canvas'),layer=document.getElementById('canvas-content');
              let attrCount=0,cssCount=0;
              const changes=new MutationObserver(items=>items.forEach(e=>{
                if(e.attributeName==='transform')attrCount++;
                if(e.attributeName==='style')cssCount++;
              }));
              changes.observe(layer,{attributes:true,attributeFilter:['style','transform']});
              const start=performance.now();
              for(let i=0;i<750;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{
                pointerId:1,pointerType:'mouse',bubbles:true,buttons:1,
                clientX:x+120+i*.2,clientY:y+80+i*.16
              }));
              const dispatchMs=performance.now()-start;
              return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
                changes.disconnect();resolve({attrCount,cssCount,dispatchMs,
                  gpuTransform:layer.style.transform,panClass:canvas.classList.contains('canvas-panning')});
              })));
            }''',{'x':x,'y':y})
            await page.mouse.up()
            end=await page.locator('#canvas-content').get_attribute('transform')
            assert end!=start,(start,end)
            assert 1<=perf['attrCount']<=4,perf
            assert 1<=perf['cssCount']<=4,perf
            assert 'translate3d(' in perf['gpuTransform'],perf
            assert perf['panClass'],perf
            assert not await page.locator('#canvas').evaluate('(e)=>e.classList.contains("canvas-panning")')
            assert not errors,errors
            print('PASS: 750 rapid pointer moves coalesced into',perf['attrCount'],'SVG updates and',perf['cssCount'],'composited style updates.',flush=True)
            # A real drag must update the hit-test positions and retain functional editing.
            await page.locator('#zoom-fit').click()
            node=page.locator('.node').first
            r=await node.bounding_box()
            await page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2)
            await page.mouse.down()
            await page.mouse.move(r['x']+r['width']/2+52,r['y']+r['height']/2+24,steps=9)
            await page.mouse.up()
            assert await page.locator('.node.selected').count()==1
            assert not errors,errors
            print('PASS: Pan, fit and node editing retain correct hit testing; no uncaught browser errors.',flush=True)
            await browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':asyncio.run(main())
