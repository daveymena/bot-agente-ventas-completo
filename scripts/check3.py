import os
from playwright.sync_api import sync_playwright
import re

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", os.environ.get("EASYPANEL_PASSWORD", ""))
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    
    body = page.text_content("body") or ""
    cpu = re.search(r'CPU\s+([\d.]+%)', body)
    mem = re.search(r'Memory\s+([\d.]+\s*\w+B)', body)
    print(f"CPU: {cpu.group(1) if cpu else 'N/A'}")
    print(f"Memory: {mem.group(1) if mem else 'N/A'}")
    
    # Check health
    page.goto("https://tecnology-ventas-pro.vr7gwz.easypanel.host/api/health", timeout=15000)
    print(f"Health URL: {page.url}")
    print(f"Health body: {(page.text_content('body') or '')[:500]}")
    browser.close()
