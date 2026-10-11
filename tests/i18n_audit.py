#!/usr/bin/env python3
"""Audit the English UI for visible untranslated Cyrillic text."""

import asyncio
import os
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 8912
URL = f"http://127.0.0.1:{PORT}/"


async def main():
    server = subprocess.Popen(
        [
            "python3",
            "-m",
            "http.server",
            str(PORT),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(ROOT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        await asyncio.sleep(0.6)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"),
                args=["--no-sandbox"],
            )
            page = await browser.new_page(locale="en-US")
            await page.goto(URL, wait_until="networkidle")
            await page.wait_for_function(
                '() => document.querySelectorAll("#built-in-select option").length === 60'
            )
            await page.locator("#file-input").set_input_files(
                str(ROOT / "tests/fixtures/tesseract.txt")
            )
            await page.locator(".node").first.wait_for()

            async def audit(place):
                visible = await page.evaluate(
                    """() => {
                        const parts = [];
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                        while (walker.nextNode()) {
                            const node = walker.currentNode;
                            const text = node.textContent.trim();
                            if (
                                /[А-Яа-яЁё]/.test(text) &&
                                node.parentElement.getClientRects().length &&
                                getComputedStyle(node.parentElement).visibility !== 'hidden'
                            ) {
                                parts.push(text.slice(0, 240));
                            }
                        }
                        return [...new Set(parts)];
                    }"""
                )
                print(f"\n{place} Cyrillic {len(visible)}")
                for text in visible:
                    print(f"  {text}")

            await audit("INITIAL")
            for kind in ["map", "zone", "connection", "pack"]:
                if kind == "zone":
                    await page.locator(".node").first.click(force=True)
                if kind == "connection":
                    await page.locator(".connection").first.click(force=True)
                if kind == "pack":
                    await page.locator("#pack-props-btn").click()
                tabs = await page.locator("#inspector-tabs button").count()
                for index in range(tabs):
                    await page.locator("#inspector-tabs button").nth(index).click()
                    await audit(f"{kind} TAB{index}")

            await page.locator("#help-btn").click()
            await audit("HELP")
            await page.locator("#modal-close").click()
            await page.locator("#install-btn").click()
            await audit("INSTALL")
            await page.locator("#modal-close").click()
            await page.locator("#validate-btn").click()
            await audit("VALIDATE")
            await page.locator("#modal-close").click()
            await browser.close()
    finally:
        server.terminate()
        server.wait()


if __name__ == "__main__":
    asyncio.run(main())
