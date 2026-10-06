#!/usr/bin/env python3
"""Template picker, JSON localization and connection rendering regressions."""
import asyncio
import os
import subprocess
from pathlib import Path
from urllib.request import urlopen

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 9023
URL = f'http://127.0.0.1:{PORT}/'


async def wait_server():
    for _ in range(60):
        try:
            if urlopen(URL, timeout=.5).status == 200:
                return
        except OSError:
            await asyncio.sleep(.1)
    raise RuntimeError('Local server did not start')


async def main():
    server = subprocess.Popen(
        ['python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', str(ROOT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        await wait_server()
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                executable_path=os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None,
                args=['--no-sandbox', '--disable-dev-shm-usage'],
            )
            context = await browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ru-RU')
            page = await context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.goto(URL, wait_until='networkidle')
            await page.wait_for_function("()=>document.querySelectorAll('#built-in-select option').length===60")

            # Russian is selected on the first Russian-browser visit and all header tooltips/subtitle are localized.
            assert await page.locator('#language-select').input_value() == 'ru'
            subtitle = ' '.join((await page.locator('.brand-text small').inner_text()).split())
            assert subtitle == 'РЕДАКТОР КОНВЕРТЕР', subtitle
            assert await page.locator('#open-btn').get_attribute('title') == 'Открыть файл · Ctrl+O'
            assert await page.locator('#theme-btn').get_attribute('title') == 'Переключить светлую/тёмную тему'
            assert 'карта' not in (await page.locator('body').inner_text()).lower()

            # Wheel-scrolling the custom built-in picker must keep it open and must not poison the next open.
            trigger = page.locator('#built-in-trigger')
            menu = page.locator('#built-in-menu')
            await trigger.click()
            assert await trigger.get_attribute('aria-expanded') == 'true'
            await menu.hover()
            await page.mouse.wheel(0, 700)
            await page.wait_for_timeout(80)
            assert await trigger.get_attribute('aria-expanded') == 'true'
            await trigger.click()  # close
            assert await trigger.get_attribute('aria-expanded') == 'false'
            await trigger.click()  # reopen after wheel
            await page.wait_for_timeout(80)
            assert await trigger.get_attribute('aria-expanded') == 'true'
            await page.locator('#built-in-menu .template-picker-option').first.click()
            await page.wait_for_function("()=>document.querySelectorAll('.node').length>0")

            # Desktop and mobile use the same SVG three-dot control treatment.
            desktop_more = await page.locator('#more-btn').evaluate(
                "e=>({w:getComputedStyle(e).width,h:getComputedStyle(e).height,usesSvg:!!e.querySelector('svg use[href=\"#i-more\"]')})"
            )
            assert desktop_more['usesSvg'] and desktop_more['w'] == desktop_more['h']

            # Border Guard and numeric guard value are both visible. Missing endpoints are never renderable.
            result = await page.evaluate("""async()=>{
                const v = await import('./src/visuals.js');
                const ids = new Set(['1','2']);
                return {
                    guard:v.connectionDisplayLabel({value:'9000',border_guard:'x'}),
                    legacyGuard:v.connectionDisplayLabel({value:'45000',border_guard:'1'}),
                    missing:v.isRenderableConnection({zone1:'',zone2:''},ids),
                    unknown:v.isRenderableConnection({zone1:'1',zone2:'99'},ids)
                };
            }""")
            assert result == {'guard': '┃ 9k', 'legacyGuard': '┃ 45k', 'missing': False, 'unknown': False}, result

            # The bundled legacy {[HotA]} Nostalgia file stores Border Guard as `1` and also stores values.
            # Every one of those connections must visibly show both the Border Guard marker and its value.
            await page.locator('#built-in-select').select_option('10')
            await page.wait_for_function("()=>document.querySelectorAll('.connection').length>0")
            await page.wait_for_timeout(120)
            border_links = page.locator('.connection.conn-border')
            assert await border_links.count() == 14
            icons = await border_links.locator('.conn-label-icon').count()
            labels = await border_links.locator('.conn-label-value').evaluate_all("els=>els.map(e=>e.textContent)")
            assert icons == 14, icons
            assert len(labels) == 14, labels
            assert labels.count('45k') == 2, labels
            assert labels.count('3k') == 12, labels

            # Legacy malformed connection rows remain in source data for byte fidelity but never become lines on canvas.
            await page.locator('#file-input').set_input_files(str(ROOT / 'tests' / 'fixtures' / 'Duel.h3t'))
            await page.wait_for_timeout(500)
            assert await page.locator('.connection.dangling').count() == 0
            visible = await page.locator('.connection').count()
            status = await page.locator('#status-conns').inner_text()
            assert status.startswith(str(visible)), (visible, status)

            assert not errors, errors
            await browser.close()
            print('PASS: custom picker wheel/reopen, RU tooltips/subtitle, terminology, menu icon and connection rendering.')
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == '__main__':
    asyncio.run(main())
