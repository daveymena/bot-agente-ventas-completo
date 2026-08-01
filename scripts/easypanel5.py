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
    
    # Check Deployments tab
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/deployments", timeout=30000)
    page.wait_for_timeout(3000)
    print("Deployments URL:", page.url)
    
    body = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_deployments.txt", "w", encoding="utf-8") as f:
        f.write(body[:20000] if body else "None")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_deployments.png", full_page=True)
    print("Screenshot saved")
    
    browser.close()
