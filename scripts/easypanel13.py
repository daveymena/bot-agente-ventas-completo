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
    
    ce = page.query_selector("[contenteditable='true']")
    if ce:
        ce.click()
        page.wait_for_timeout(500)
        
        # Select all and delete
        page.keyboard.press("Control+a")
        page.wait_for_timeout(200)
        page.keyboard.press("Delete")
        page.wait_for_timeout(200)
        
        # migrate.mjs requires DATABASE_URL to be non-empty
        new_env = """NODE_ENV=production
PORT=3002
HOST=0.0.0.0
USE_SQLITE=true
SQLITE_PATH=./data/tecnovariedades.db
DATABASE_URL=postgres://posgrest:6715320Dvd.@tecnology_whatsapp-agen:5432/agente?sslmode=disable
OPENCODE_API_URL=https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1
OPENCODE_MODEL=opencode/deepseek-v4-flash-free
OPENCODE_API_KEY=sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE
AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,github_copilot_internal,nvidia,g4f
GITHUB_TOKEN=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
GITHUB_MODEL=gpt-4o-mini
GITHUB_MODEL_CLAUDE=claude-sonnet-4-20250514
NVIDIA_API_KEY=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
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
NVIDIA_MODEL_FAST=meta/llama-3.1-8b-instruct
TRANSFER_NUMBER=3004654821
TRANSFER_NAME=Deyner Mena
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deinermena25@gmail.com
SMTP_PASS=
EMAIL_FROM=deinermena25@gmail.com
EMAIL_TO=daveymena16@gmail.com
TYPING_DELAY_MIN=800
TYPING_DELAY_MAX=2000
READ_RECEIPT_DELAY=500
HUMAN_PAUSE_MIN=1000
HUMAN_PAUSE_MAX=3000
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000
"""
        page.keyboard.type(new_env, delay=5)
        page.wait_for_timeout(500)
        
        save_btn = page.query_selector("button:has-text('Save')")
        if save_btn:
            save_btn.click()
            print("Clicked Save")
    
    page.wait_for_timeout(3000)
    page.screenshot(path="C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot\\data\\ep_env_final.png", full_page=True)
    print("Done")
    browser.close()
