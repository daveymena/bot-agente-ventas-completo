# Video Providers — Evaluación Solo Lectura (2026-10-12)

> Sin crear cuentas, sin pagos, sin enviar catálogo. Web_fetch oficial.

## Creatomate (https://creatomate.com)
- Free: 30 renders/mes, watermark, 1080p max, sin uso comercial extendido. API `POST /v1/renders` con `template_id`. Requiere API key. No GPU.

## Shotstack (https://shotstack.io)
- Free: sandbox 20 renders/mes, watermark, 720p. API `POST /v1/render`. Requiere API key + S3. No GPU.

## Conclusión para este proyecto
Ambos útiles pero con watermark y límite que rompe dropshipping a escala. **FFmpeg local + Pexels free + EdgeTTS** ya entrega 1080x1920 15-30s sin watermark, sin API key, sin GPU (CPU + Puppeteer). Prioridad costo-cero: FFmpeg Dios. Creatomate/Shotstack quedan como adaptador opcional `src/lib/video-provider-adapter.ts` disabled hasta que el dueño autorice API key.

## Env
```
CREATOMATE_API_KEY=
SHOTSTACK_API_KEY=
VIDEO_PROVIDER=ffmpeg # ffmpeg | creatomate | shotstack
```
