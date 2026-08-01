import os
from playwright.sync_api import sync_playwright
import re

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://35.254.218.190:3000/", timeout=30000)
    page.fill("input[name='email']", "daveymena16@gmail.com")
    page.fill("input[name='password']", os.environ.get("EASYPANEL_PASSWORD", ""))
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)
    
    page.goto("http://35.254.218.190:3000/projects/tecnology/app/ventas-pro", timeout=30000)
    page.wait_for_timeout(3000)
    
    body = page.text_content("body") or ""
    
    # Check if container is running
    cpu_match = re.search(r'CPU\s+([\d.]+%)', body)
    mem_match = re.search(r'Memory\s+([\d.]+\s*\w+B)', body)
    status_match = re.search(r'(Stopped|Running|Error|healthy|unhealthy|Crash)', body, re.IGNORECASE)
    
    print(f"CPU: {cpu_match.group(1) if cpu_match else '0%'}")
    print(f"Memory: {mem_match.group(1) if mem_match else '0 B'}")
    
    # Get all buttons
    buttons = page.query_selector_all("button")
    print(f"\nButtons ({len(buttons)}):")
    for btn in buttons:
        txt = btn.text_content()
        if txt and txt.strip():
            is_vis = btn.is_visible()
            is_dis = btn.is_disabled()
            print(f"  '{txt.strip()[:30]}' visible={is_vis} disabled={is_dis}")
    
    # Check if there's a way to start/restart the container
    deploy_btn = page.query_selector("button:has-text('Deploy')")
    if deploy_btn and deploy_btn.is_visible():
        print("\nDeploy button is visible - might trigger rebuild")
    
    # Look for any "Start" or "Restart" buttons
    start_btn = page.query_selector("button:has-text('Start')")
    restart_btn = page.query_selector("button:has-text('Restart')")
    if start_btn: print("Start button found")
    if restart_btn: print("Restart button found")
    
    # Save the full body text for analysis
    with open("C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_status_final.txt", "w", encoding="utf-8") as f:
        f.write(body[:5000] if body else "None")
    
    browser.close()
