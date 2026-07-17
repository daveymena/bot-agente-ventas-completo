from playwright.sync_api import sync_playwright
import re

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(5000)
    
    # Get full HTML
    html = page.content()
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_html.html", "w", encoding="utf-8") as f:
        f.write(html[:30000])
    print(f"HTML length: {len(html)}")
    
    # Try to find status info in HTML
    cpu_match = re.search(r'CPU[^<]*?([\d.]+%)', html)
    mem_match = re.search(r'Memory[^<]*?([\d.]+\s*\w+B)', html)
    if cpu_match: print(f"CPU: {cpu_match.group(1)}")
    if mem_match: print(f"Memory: {mem_match.group(1)}")
    
    # Check for __NEXT_DATA__
    next_match = re.search(r'__NEXT_DATA__.*?({.*?})</script>', html, re.DOTALL)
    if next_match:
        with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_next_data.json", "w", encoding="utf-8") as f:
            f.write(next_match.group(1)[:2000])
        print("__NEXT_DATA__ found")
    
    # Look for API endpoints
    api_endpoints = re.findall(r'(/api/[^\s"\'<>]+)', html)
    for ep in set(api_endpoints):
        print(f"API: {ep}")
    
    browser.close()
