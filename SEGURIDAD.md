# Seguridad de la plataforma — estado y pasos (09-10-2026)

Pedido del dueño: "que no se deje hackear fácilmente, ni la plataforma ni nada de lo que tenemos, y que sea sostenible".

## Verificado hoy (desde afuera, sin credenciales)

| Qué | Estado |
|---|---|
| Postgres (5432-5436) en 161.97.182.95 | ✅ cerrados (el 23-09 la prod estaba expuesta en 5435) |
| App en :8080 HTTP plano | ✅ cerrado |
| 20 rutas sensibles de `/api/*` sin sesión | ✅ todas responden 401 |
| Landing Forge (`landings.ventasproia.com`) sin sesión | ✅ redirige / 401 |
| Vendedor ante instrucciones metidas en un mensaje de cliente | ✅ no las obedece (probado por accidente en el chat de prueba) |
| **Ollama en :11434 de 161.97.182.95** | 🔴 **abierto sin clave**, con sesión de ollama.com (modelos `-cloud`): cualquiera gasta la cuota Pro |
| **Panel EasyPanel :3000 por HTTP** (161.97.182.95 y 144.91.112.79) | 🔴 la contraseña viaja sin cifrar |
| **Servidor viejo 144.91.112.79** | 🔴 encendido con panel expuesto |
| **7 repos públicos en GitHub** (landing-forge, snapfree, bot-agente-ventas, bot2, exnova-trader2, duvier, landingpage-ai) | 🟠 sin revisar contenido |
| Claves que estuvieron expuestas (Postgres en logs, PAT de GitHub, contraseña EasyPanel en notas) | 🟠 sin rotar |

## Ollama: hay DOS y ninguno de EasyPanel abre el 11434

- **Local** (EasyPanel): `tecnoia/ollama` y `ollama/ollama`. Ninguno publica puertos (Avanzado → Puertos vacío).
- **Cloud Pro** (ollama.com): se usa con `OLLAMA_CLOUD_API_KEY`.
- El bot usa `OLLAMA_LOCAL_URL = http://tecnoia_ollama:11434` (**red interna de Docker**). Medido con
  `GET /api/code-agent/ollama-local-diagnostico` (solo admin): responde, 4 modelos. `ollama_ollama:11434` también responde por dentro.
- Conclusión: lo que contesta en el **11434 público es un Ollama instalado directo en el servidor** (servicio del sistema o `docker run` fuera de EasyPanel). El bot no lo usa: bloquearlo no corta nada.

### Cómo cerrarlo (por SSH en 161.97.182.95)

```bash
# 1) ver quién escucha en 11434
sudo ss -ltnp | grep 11434
# 2a) si es el servicio del sistema: que escuche solo en localhost
sudo systemctl edit ollama   # agregar:  [Service]  Environment="OLLAMA_HOST=127.0.0.1:11434"
sudo systemctl restart ollama
# 2b) si es un contenedor suelto: docker ps | grep ollama  → recrearlo sin -p 11434:11434 (o borrarlo si no se usa)
# 3) y además, el firewall (Docker se salta ufw en puertos publicados: por eso 2a/2b primero)
sudo ufw deny 11434/tcp
# 4) comprobar desde afuera que ya no responde, y que el bot sigue igual:
#    curl -m 5 http://161.97.182.95:11434/api/tags   → debe fallar
#    GET /api/code-agent/ollama-local-diagnostico    → "actual.responde": true
```

## Pendiente, en orden

1. **Cambiar la contraseña de EasyPanel y activar 2FA** (la vieja está en texto plano en notas). Entrar al panel solo por un dominio con HTTPS; cerrar :3000 al público si EasyPanel lo permite.
2. **Cerrar el Ollama del 11434** (arriba).
3. **Apagar 144.91.112.79** si ya no se usa (la base vieja ya está apagada).
4. **Repos públicos → privados**, uno por uno, revisando antes en EasyPanel que su deploy use la integración de GitHub con token (si clona por URL pública, el deploy se rompe al hacerlo privado).
5. **Rotar**: contraseña de Postgres, PAT de GitHub (`ghp_…`), contraseña de EasyPanel; borrar del disco los `.txt` con claves (`Videos/ghp_…txt`, `api easypanel.txt`, `env.txt`, `RESTAURAR-ENV-easypanel.txt`) y pasarlas a un gestor de contraseñas.
6. **Chequeo semanal automático** (lo sostenible): repetir estas verificaciones (puertos, rutas sin sesión, repos públicos) y avisar por WhatsApp si algo se abre.
