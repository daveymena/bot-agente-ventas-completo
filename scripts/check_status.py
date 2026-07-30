import os
from playwright.sync_api import sync_playwright

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
    
    body = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_status.txt", "w", encoding="utf-8") as f:
        f.write(body[:15000] if body else "None")
    
    # Check CPU/Memory
    import re
    cpu_match = re.search(r'CPU\s+([\d.]+%)', body or "")
    mem_match = re.search(r'Memory\s+([\d.]+\s*\w+B)', body or "")
    print(f"CPU: {cpu_match.group(1) if cpu_match else 'N/A'}")
    print(f"Memory: {mem_match.group(1) if mem_match else 'N/A'}")
    
    browser.close()
