import os
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", os.environ.get("EASYPANEL_PASSWORD", ""))
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    # Go to environment tab
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro/environment", timeout=30000)
    page.wait_for_timeout(3000)
    
    # Take a screenshot before modifying
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_env_before.png", full_page=True)
    
    # Look for editable textarea or input for env vars
    textareas = page.query_selector_all("textarea")
    print(f"Textareas: {len(textareas)}")
    for i, ta in enumerate(textareas):
        val = ta.input_value()
        print(f"  [{i}] val[:100]: {val[:100] if val else 'empty'}")
    
    inputs = page.query_selector_all("input:not([type='hidden'])")
    print(f"\nInputs: {len(inputs)}")
    for inp in inputs:
        name = inp.get_attribute("name") or ""
        id_attr = inp.get_attribute("id") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        val = inp.input_value() or ""
        type_attr = inp.get_attribute("type") or ""
        if val or placeholder:
            print(f"  name={name} id={id_attr} type={type_attr} placeholder={placeholder} val={val[:50]}")
    
    # Look for any editable elements
    editable = page.query_selector_all("[contenteditable='true']")
    print(f"\nContenteditable: {len(editable)}")
    
    browser.close()
