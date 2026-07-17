from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", "6715320Dvd.")
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/environment", timeout=30000)
    page.wait_for_timeout(3000)
    
    # Get the contenteditable element
    ce = page.query_selector("[contenteditable='true']")
    if ce:
        text = ce.text_content()
        print(f"Editor text length: {len(text) if text else 0}")
        print(f"Editor text: {text[:200] if text else 'None'}...")
        
        # Check if there's a save button
        save_btn = page.query_selector("button:has-text('Save')")
        if save_btn:
            print("Save button found:", save_btn.text_content())
        
        # Check for other buttons
        buttons = page.query_selector_all("button")
        for btn in buttons:
            txt = btn.text_content()
            if txt and txt.strip():
                print(f"  Button: '{txt.strip()[:40]}'")
    
    # Also check for codemirror or monaco editor
    cm = page.query_selector(".cm-editor, .monaco-editor, .view-lines")
    if cm:
        print("\nCode editor found!")
    
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_env_editor.png", full_page=True)
    
    browser.close()
