# Video IA Image-to-Video

VentasPro conserva Chromium + FFmpeg y añade una capa opcional de Image-to-Video (I2V).

## Flujo
Producto → guion → imagen de escena → prompt de movimiento → I2V → clip → overlay de texto/CTA → composición final.

La IA I2V parte de la imagen original de la escena. El texto, precio, marca, CTA y locución siguen controlados por VentasPro.

## Proveedores
- xAI / Grok Imagine Video 1.5
- Google / Veo 3.1

## Variables
VIDEO_AI_ENABLED=false
VIDEO_AI_PROVIDER=auto
VIDEO_AI_MAX_SCENES=3
VIDEO_AI_DEFAULT_DURATION=6
VIDEO_AI_MAX_DURATION=8
VIDEO_AI_TIMEOUT_MS=600000
VIDEO_AI_HTTP_TIMEOUT_MS=90000
VIDEO_AI_DOWNLOAD_TIMEOUT_MS=180000
VIDEO_AI_POLL_INTERVAL_MS=5000
VIDEO_AI_MAX_DOWNLOAD_BYTES=300000000
XAI_API_KEY=
XAI_VIDEO_MODEL=grok-imagine-video-1.5
GEMINI_API_KEY=
GEMINI_VIDEO_MODEL=veo-3.1-generate-preview

VIDEO_AI_ENABLED=false conserva el pipeline anterior.

Cuando está habilitado, se intentan animar únicamente escenas compatibles, se limita el número de escenas, se prueban los proveedores configurados y cada fallo vuelve al motor FFmpeg actual.

## Atlas
La acción generate_ai_ad_video requiere confirmación porque la generación I2V puede consumir crédito externo.

## Seguridad
Las API keys solo se leen en backend. No se devuelven al frontend ni se incluyen en logs.