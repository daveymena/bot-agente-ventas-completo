"""Configuración Gunicorn — alineada con init.sh y MAX_TIMEOUT."""
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
workers = int(os.environ.get("GUNICORN_WORKERS", "2"))
worker_class = os.environ.get("GUNICORN_WORKER_CLASS", "gevent")
worker_connections = int(os.environ.get("GUNICORN_WORKER_CONNECTIONS", "100"))

_max = int(os.environ.get("MAX_TIMEOUT", "180"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", str(_max + 60)))
graceful_timeout = 30
keepalive = 10
max_requests = 1000
max_requests_jitter = 50

# Evita WORKER TIMEOUT cuando Zen tarda; debe ser > MAX_TIMEOUT del upstream
preload_app = False
