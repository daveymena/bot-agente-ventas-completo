FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai

WORKDIR /app

COPY artifacts/opencode-proxy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY artifacts/opencode-proxy/server.py \
     artifacts/opencode-proxy/opencode_cli_wrapper.py \
     artifacts/opencode-proxy/auth_manager.py \
     artifacts/opencode-proxy/gunicorn.conf.py \
     artifacts/opencode-proxy/init.sh ./
COPY artifacts/opencode-proxy/templates/ ./templates/

RUN mkdir -p logs data && chmod -R 777 /app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["/app/init.sh"]
