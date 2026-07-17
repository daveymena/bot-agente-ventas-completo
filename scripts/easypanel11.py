from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Get cookies/tokens for API access
    cookies = context.cookies()
    print("Cookies:")
    for c in cookies:
        print(f"  {c['name']}: {c['value'][:40]}...")
    
    # Check local storage for tokens
    token = page.evaluate("() => localStorage.getItem('token')")
    print(f"\nLocalStorage token: {token[:50] if token else 'None'}")
    
    # Try to get session from localStorage
    session = page.evaluate("() => { return JSON.stringify(localStorage); }")
    print(f"localStorage keys: {list(session.keys()) if session else 'None'}")
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    
    # Try to extract API token from the page
    api_token = page.evaluate("() => { return window.__NEXT_DATA__ || null; }")
    if api_token:
        print(f"\nNext data found")
    
    browser.close()
