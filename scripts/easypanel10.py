from playwright.sync_api import sync_playwright

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
    
    # Get current status
    status_el = page.query_selector("[class*='status'], [class*='Status'], .status")
    if status_el:
        print("Status:", status_el.text_content())
    else:
        body = page.text_content("body")
        # Find status indicators
        idx = body.find("CPU")
        if idx >= 0:
            print("Status snippet:", body[max(0,idx-50):idx+100])
        
        # Check for running/stopped indicators
        for kw in ["Running", "running", "Stopped", "stopped", "Error", "Crash"]:
            if kw in body:
                print(f"Found status keyword: {kw}")
    
    # Click Logs button
    logs_btn = page.query_selector("button:has-text('Logs')")
    if logs_btn:
        logs_btn.click()
        page.wait_for_timeout(3000)
        print("\nClicked Logs button")
        page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_logs.png", full_page=True)
        
        # Try to get log content
        log_content = page.text_content("body")
        with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_logs_content.txt", "w", encoding="utf-8") as f:
            f.write(log_content[:20000] if log_content else "None")
        print("Logs written to file")
    
    browser.close()
