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
    
    # Get cookies
    cookies = context.cookies()
    print("Cookies:", {c["name"]: c["value"][:40] for c in cookies})
    
    # Look for Easypanel API calls
    # Intercept network requests
    api_requests = []
    def on_request(request):
        url = request.url
        if "api" in url.lower() and "3000" in url:
            api_requests.append({
                "url": url,
                "method": request.method,
                "headers": dict(request.headers),
            })
    
    page.on("request", on_request)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    
    for req in api_requests[:5]:
        print(f"\nAPI: {req['method']} {req['url']}")
        for k, v in req["headers"].items():
            if k.lower() in ("authorization", "cookie", "x-csrf-token"):
                print(f"  {k}: {v[:80]}")
    
    browser.close()
