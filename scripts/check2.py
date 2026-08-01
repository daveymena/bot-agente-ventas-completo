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
    import re
    cpu = re.search(r'CPU\s+([\d.]+%)', body or "")
    mem = re.search(r'Memory\s+([\d.]+\s*\w+B)', body or "")
    print(f"CPU: {cpu.group(1) if cpu else 'N/A'}")
    print(f"Memory: {mem.group(1) if mem else 'N/A'}")
    
    # Check status
    for kw in ["Running", "running", "healthy", "unhealthy", "Stopped", "Error", "CrashLoopBackOff"]:
        if kw in (body or ""):
            print(f"Status found: {kw}")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_after_build.png", full_page=True)
    
    # Check deployments
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/deployments", timeout=30000)
    page.wait_for_timeout(2000)
    depl = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_deploy_after.txt", "w", encoding="utf-8") as f:
        f.write(depl[:10000] if depl else "None")
    print("Deployments saved")
    browser.close()
