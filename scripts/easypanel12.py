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
    
    # Look for Deploy button
    deploy_btns = page.query_selector_all("button:has-text('Deploy')")
    print(f"Deploy buttons: {len(deploy_btns)}")
    for btn in deploy_btns:
        txt = btn.text_content()
        print(f"  Button text: '{txt}'")
        print(f"  Visible: {btn.is_visible()}")
        print(f"  Disabled: {btn.is_disabled()}")
    
    # Look for Force Rebuild
    force_btns = page.query_selector_all("button:has-text('Force')")
    print(f"\nForce buttons: {len(force_btns)}")
    
    # Try clicking first Deploy button
    if deploy_btns:
        deploy_btns[0].click()
        print("\nClicked Deploy")
        page.wait_for_timeout(3000)
        
        body = page.text_content("body")
        with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_after_deploy.txt", "w", encoding="utf-8") as f:
            f.write(body[:10000] if body else "None")
        print("After deploy written to file")
        
        page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_after_deploy.png", full_page=True)
    
    browser.close()
