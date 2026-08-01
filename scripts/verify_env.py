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
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/environment", timeout=30000)
    page.wait_for_timeout(3000)
    
    ce = page.query_selector("[contenteditable='true']")
    if ce:
        text = ce.text_content()
        print("Current env (first 500 chars):")
        print(text[:500] if text else "None")
        
        # Check if DATABASE_URL is set
        if text:
            for line in text.split("\n"):
                if "DATABASE_URL" in line or "USE_SQLITE" in line or "SQLITE_PATH" in line:
                    print(f"  -> {line}")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_env_verify.png", full_page=True)
    browser.close()
