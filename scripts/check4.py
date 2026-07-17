from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Check deployments with latest status
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/deployments", timeout=30000)
    page.wait_for_timeout(3000)
    
    # Get the latest deployment
    body = page.text_content("body") or ""
    
    # Find deployment entries - look for timestamps
    import re
    # Find "View" links which indicate deployment entries
    view_links = page.query_selector_all("a:has-text('View')")
    print(f"Found {len(view_links)} deployment entries")
    
    # Click the first "View" to see deployment details
    if view_links:
        view_links[0].click()
        page.wait_for_timeout(3000)
        print(f"Deployment detail URL: {page.url}")
        
        detail_body = page.text_content("body") or ""
        with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_deploy_detail.txt", "w", encoding="utf-8") as f:
            f.write(detail_body[:20000] if detail_body else "None")
        print("Deployment detail saved")
        
        page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_deploy_detail.png", full_page=True)
    
    browser.close()
