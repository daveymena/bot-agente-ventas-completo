from playwright.sync_api import sync_playwright
import sys, os

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
    
    # Navigate to project services
    page.goto("http://35.254.218.190:3000/projects/tecnology", timeout=30000)
    page.wait_for_timeout(3000)
    print("Project page:", page.url)
    
    # Save body
    body = page.text_content("body")
    out_path = "C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\easypanel_project.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(body[:10000] if body else "None")
    
    # Get all links
    links = page.query_selector_all("a")
    print("\nLinks found:")
    for link in links:
        href = link.get_attribute("href")
        text = link.text_content()
        if href:
            print(f"  {text.strip()[:60]:60s} -> {href}")
    
    # Get all buttons
    buttons = page.query_selector_all("button")
    print("\nButtons found:")
    for btn in buttons:
        text = btn.text_content()
        if text and text.strip():
            print(f"  {text.strip()[:60]}")
    
    # Screenshot
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_projects.png", full_page=True)
    print("\nScreenshot saved")
    
    browser.close()
