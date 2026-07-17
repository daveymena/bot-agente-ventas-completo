from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Go to ventas-pro app service
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    print("ventas-pro URL:", page.url)
    
    body = page.text_content("body")
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_ventas-pro.txt", "w", encoding="utf-8") as f:
        f.write(body[:10000] if body else "None")
    
    # Get all links
    links = page.query_selector_all("a")
    print("\nLinks in this page:")
    for link in links:
        href = link.get_attribute("href")
        text = link.text_content()
        if href and text.strip():
            print(f"  [{text.strip()[:50]}] -> {href}")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_ventas-pro.png", full_page=True)
    
    browser.close()
