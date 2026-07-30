import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# Ver el mismo comentario en easypanel9.py -- este archivo tenía la
# contraseña real del panel Y un volcado completo de secretos de
# producción (password de la BD incluido en el DATABASE_URL) hardcodeados.
EASYPANEL_URL = os.environ.get("EASYPANEL_URL", "http://35.254.218.190:3000")
EASYPANEL_EMAIL = os.environ.get("EASYPANEL_EMAIL", "")
EASYPANEL_PASSWORD = os.environ.get("EASYPANEL_PASSWORD", "")
ENV_FILE = Path(__file__).parent / ".env.easypanel.local"

if not EASYPANEL_EMAIL or not EASYPANEL_PASSWORD:
    raise SystemExit("Faltan EASYPANEL_EMAIL / EASYPANEL_PASSWORD en el entorno.")
if not ENV_FILE.exists():
    raise SystemExit(f"Falta {ENV_FILE} -- poné ahí el .env real a pegar en Easypanel (no se sube a git).")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.goto(f"{EASYPANEL_URL}/", timeout=30000)
    page.fill("input[name='email']", EASYPANEL_EMAIL)
    page.fill("input[name='password']", EASYPANEL_PASSWORD)
    page.click("button[type='submit']")
    page.wait_for_timeout(3000)

    page.goto(f"{EASYPANEL_URL}/projects/tecnology/app/ventas-pro/environment", timeout=30000)
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

        # migrate.mjs requires DATABASE_URL to be non-empty -- el valor real
        # va en scripts/.env.easypanel.local (gitignored), no acá.
        new_env = ENV_FILE.read_text(encoding="utf-8")
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
