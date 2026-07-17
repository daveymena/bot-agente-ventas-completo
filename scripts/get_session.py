from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Get cookies and localStorage
    cookies = context.cookies()
    print("Session cookie:", {c["name"]: c["value"][:30] for c in cookies if "sess" in c["name"].lower() or "token" in c["name"].lower() or c["name"] == "connect.sid"})
    
    # Get all cookies
    cookie_dict = {}
    for c in cookies:
        cookie_dict[c["name"]] = c["value"]
        print(f"Cookie: {c['name']} = {c['value'][:40]}")
    
    # Try to find the session/token
    # Check for a specific API call pattern
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000, wait_until="networkidle")
    page.wait_for_timeout(2000)
    
    # Try to extract bearer token from the page
    token = page.evaluate("""() => {
        // Try various methods to find auth token
        const l = localStorage;
        if (!l) return null;
        const keys = Object.keys(l);
        const result = {};
        for (const k of keys) {
            result[k] = l.getItem(k)?.substring(0, 40);
        }
        return result;
    }""")
    print(f"\nlocalStorage: {json.dumps(token, indent=2) if token else 'None'}")
    
    # Check sessionStorage
    session = page.evaluate("""() => {
        const s = sessionStorage;
        if (!s) return null;
        const keys = Object.keys(s);
        const result = {};
        for (const k of keys) {
            result[k] = s.getItem(k)?.substring(0, 40);
        }
        return result;
    }""")
    print(f"\nsessionStorage: {json.dumps(session, indent=2) if session else 'None'}")
    
    browser.close()
