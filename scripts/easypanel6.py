from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Check Overview tab for more details
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    
    body = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_overview.txt", "w", encoding="utf-8") as f:
        f.write(body[:20000] if body else "None")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_overview.png", full_page=True)
    
    # Check if there is a "Logs" button or link
    logs_btn = page.query_selector("text=Logs")
    if logs_btn:
        print("Logs button found!")
    
    # Look for any error indicators
    error_elements = page.query_selector_all("[class*='error'], [class*='error'], [class*='alert'], [class*='warning']")
    print(f"Potential error elements: {len(error_elements)}")
    
    print("Screenshot saved")
    browser.close()
