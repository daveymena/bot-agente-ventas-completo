from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    print("Title:", page.title())
    
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    print("After login:", page.url)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology", timeout=30000)
    page.wait_for_timeout(2000)
    print("Project:", page.url)
    
    body = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\easypanel_body.txt", "w", encoding="utf-8") as f:
        f.write(body[:5000] if body else "None")
    print("Body written to file")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\easypanel_project.png")
    print("Screenshot saved")
    
    browser.close()
