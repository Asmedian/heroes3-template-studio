import asyncio,os,subprocess,re
from playwright.async_api import async_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
async def main():
 s=subprocess.Popen(['python3','-m','http.server','8912','--bind','127.0.0.1','--directory',str(root)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  await asyncio.sleep(.6)
  async with async_playwright() as p:
   b=await p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'),args=['--no-sandbox'])
   page=await b.new_page(locale='en-US')
   await page.goto('http://127.0.0.1:8912/',wait_until='networkidle')
   await page.wait_for_function('()=>document.querySelectorAll("#built-in-select option").length===60')
   await page.locator('#file-input').set_input_files(str(root/'tests/fixtures/tesseract.txt'))
   await page.locator('.node').first.wait_for()
   async def audit(place):
    visible=await page.evaluate('''()=>{const parts=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){
      const n=walker.currentNode, t=n.textContent.trim();if(/[А-Яа-яЁё]/.test(t)&&n.parentElement.getClientRects().length&&getComputedStyle(n.parentElement).visibility!=='hidden')parts.push(t.slice(0,240));}return [...new Set(parts)];}''')
    print('\n'+place+' Cyrillic '+str(len(visible)))
    for t in visible: print('  '+t)
   await audit('INITIAL')
   for kind in ['map','zone','connection','pack']:
    if kind=='zone':await page.locator('.node').first.click(force=True)
    if kind=='connection':await page.locator('.connection').first.click(force=True)
    if kind=='pack':await page.locator('#pack-props-btn').click()
    tabs=await page.locator('#inspector-tabs button').count()
    for idx in range(tabs):
     await page.locator('#inspector-tabs button').nth(idx).click()
     await audit(kind+' TAB'+str(idx))
   await page.locator('#help-btn').click();await audit('HELP')
   await page.locator('#modal-close').click()
   await page.locator('#install-btn').click();await audit('INSTALL')
   await page.locator('#modal-close').click()
   await page.locator('#validate-btn').click();await audit('VALIDATE')
   await page.locator('#modal-close').click()
   await b.close()
 finally:s.terminate();s.wait()
asyncio.run(main())
