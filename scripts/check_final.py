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
    page.wait_for_timeout(3000)
    
    body = page.text_content("body") or ""
    
    cpu = re.search(r'CPU\s+([\d.]+%)', body)
    mem = re.search(r'Memory\s+([\d.]+\s*\w+B)', body)
    net = re.search(r'Network I/O\s+([\d.]+\s*\w+B)\s*/\s*([\d.]+\s*\w+B)', body)
    
    print(f"CPU: {cpu.group(1) if cpu else 'N/A'}")
    print(f"Memory: {mem.group(1) if mem else 'N/A'}")
    if net: print(f"Network I/O: {net.group(1)} / {net.group(2)}")
    
    # Check if there's a status indicator
    status_match = re.search(r'(Running|Stopped|Error|Crash|healthy|unhealthy|starting)', body, re.IGNORECASE)
    if status_match:
        print(f"Status: {status_match.group(1)}")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_ventas-final.png", full_page=True)
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_ventas-final.txt", "w", encoding="utf-8") as f:
        f.write(body[:8000])
    
    browser.close()
