# 🎯 OpenCode Bridge - Instrucciones Completas

## ¿Qué es este proyecto?

**OpenCode Bridge** te permite usar los **modelos de IA gratuitos de OpenCode** (como DeepSeek V4 Flash) desde tus propias aplicaciones externas, sin necesidad de API keys de pago ni estar dentro de la terminal de OpenCode.

## 🎁 ¿Qué obtienes?

- ✅ Acceso a **DeepSeek V4 Flash** (gratis)
- ✅ Otros modelos gratuitos de OpenCode Zen
- ✅ API compatible con OpenAI (usa tu código existente)
- ✅ Sin límites de tokens locales
- ✅ Streaming de respuestas
- ✅ Mantiene contexto de conversación

## 📋 Requisitos

1. **OpenCode instalado** (https://opencode.ai)
2. **Python 3.8+** o **Node.js 16+**
3. **Cuenta en OpenCode Zen** (gratis en opencode.ai)

## 🚀 Instalación Rápida

### Opción 1: Script Automático (Linux/Mac)

```bash
# Clonar o descargar el proyecto
cd opencode-bridge

# Ejecutar instalación automática
./setup.sh
```

### Opción 2: Manual (Windows/Linux/Mac)

```bash
# 1. Instalar dependencias Python
pip install -r requirements.txt

# 2. (Opcional) Instalar dependencias Node.js
npm install

# 3. Configurar OpenCode
opencode
# Dentro de OpenCode:
# - Ejecutar: /connect
# - Seleccionar: "OpenCode Zen"
# - Pegar tu API key de Zen (obtener en opencode.ai)
# - Ejecutar: /models
# - Seleccionar: deepseek/deepseek-v4-flash (FREE)
```

## 🎮 Uso Básico

### Paso 1: Iniciar OpenCode Server

```bash
# Terminal 1: Iniciar servidor
opencode serve
```

Deberías ver:
```
✓ Server running on http://localhost:4096
```

### Paso 2: Usar desde Python

```python
from method1_server.client import OpenCodeClient

# Crear cliente
client = OpenCodeClient()

# Usar el modelo gratuito
response = client.chat("Explica qué es recursión")
print(response)
```

### Paso 3: Probar Ejemplos

```bash
# Test de conexión
python method1-server/test_connection.py

# Chatbot interactivo
python examples/chatbot_simple.py

# Generador de código
python examples/generador_codigo.py
```

## 🌐 Método Avanzado: Proxy OpenAI-Compatible

Si quieres usar el formato de OpenAI API (compatible con LangChain, etc.):

### Paso 1: Iniciar OpenCode Server

```bash
# Terminal 1
opencode serve
```

### Paso 2: Iniciar Proxy

```bash
# Terminal 2
python method2-proxy/proxy_server.py
```

### Paso 3: Usar con SDK de OpenAI

```python
from openai import OpenAI

# Apuntar al proxy local (¡sin API key real!)
client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy"  # No se necesita key real
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "user", "content": "Hola mundo"}
    ]
)

print(response.choices[0].message.content)
```

## 📁 Estructura del Proyecto

```
opencode-bridge/
├── README.md                      # Documentación principal
├── GUIA_RAPIDA.md                # Guía de inicio rápido
├── INSTRUCCIONES_COMPLETAS.md    # Este archivo
├── requirements.txt              # Dependencias Python
├── package.json                  # Dependencias Node.js
├── setup.sh                      # Script de instalación
│
├── method1-server/               # Método 1: Cliente directo
│   ├── README.md
│   ├── client.py                 # Cliente Python
│   ├── client.js                 # Cliente Node.js
│   └── test_connection.py        # Tests
│
├── method2-proxy/                # Método 2: Proxy OpenAI
│   ├── README.md
│   └── proxy_server.py           # Servidor proxy
│
└── examples/                     # Ejemplos de uso
    ├── chatbot_simple.py
    ├── generador_codigo.py
    └── uso_con_openai_sdk.py
```

## 🔧 Casos de Uso

### 1. Chatbot Conversacional

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()
session_id = client.create_session()

while True:
    user_input = input("Tú: ")
    response = client.chat(user_input, session_id=session_id)
    print(f"Bot: {response}")
```

### 2. Generador de Código

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()

prompt = """
Crea una función en Python que:
- Reciba una lista de números
- Retorne solo los números pares
"""

codigo = client.chat(prompt)
print(codigo)
```

### 3. Análisis de Texto

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()

texto = "Tu texto largo aquí..."
analisis = client.chat(f"Resume este texto: {texto}")
print(analisis)
```

### 4. Integración con LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy",
    model="deepseek-v4-flash"
)

response = llm.invoke("¿Qué es Python?")
print(response.content)
```

## 🐛 Solución de Problemas

### Error: "Connection refused"

**Causa**: OpenCode Server no está corriendo

**Solución**:
```bash
# Verifica que esté corriendo
opencode serve

# En otra terminal, prueba
curl http://localhost:4096/api/status
```

### Error: "Model not found"

**Causa**: El modelo no está configurado en OpenCode

**Solución**:
```bash
opencode
/models
# Selecciona: deepseek/deepseek-v4-flash
```

### Error: "Rate limit exceeded"

**Causa**: Has excedido el límite gratuito

**Solución**: 
- Espera unos minutos
- Los modelos gratuitos tienen límites de uso
- Considera OpenCode Go ($10/mes) para más uso

### Error: "Invalid API key" (en proxy)

**Causa**: Confusión sobre la API key

**Solución**: 
- El proxy NO valida API keys
- Usa cualquier string como "dummy"
- La key real está en OpenCode, no en el proxy

## 📊 Comparación de Métodos

| Característica | Método 1: Cliente Directo | Método 2: Proxy OpenAI |
|----------------|---------------------------|------------------------|
| Facilidad | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Compatibilidad | Solo este proyecto | Cualquier SDK OpenAI |
| Streaming | ✅ | ✅ |
| Contexto | ✅ | ✅ |
| LangChain | ❌ | ✅ |
| Setup | Más simple | Requiere proxy |

## 🎓 Tutoriales Paso a Paso

### Tutorial 1: Primera Vez con OpenCode

1. **Instalar OpenCode**
   ```bash
   curl -fsSL https://opencode.ai/install.sh | sh
   ```

2. **Crear cuenta en OpenCode Zen**
   - Ve a https://opencode.ai
   - Regístrate (gratis)
   - Obtén tu API key de Zen

3. **Configurar OpenCode**
   ```bash
   opencode
   /connect
   # Seleccionar "OpenCode Zen"
   # Pegar tu API key
   /models
   # Seleccionar "deepseek/deepseek-v4-flash"
   ```

4. **Probar**
   ```bash
   # Dentro de OpenCode
   Hola, ¿cómo estás?
   # Deberías recibir una respuesta
   ```

### Tutorial 2: Usar en tu Proyecto Python

1. **Instalar este proyecto**
   ```bash
   git clone <tu-repo>
   cd opencode-bridge
   pip install -r requirements.txt
   ```

2. **Iniciar servidor**
   ```bash
   opencode serve
   ```

3. **Crear tu script**
   ```python
   # mi_app.py
   from method1_server.client import OpenCodeClient
   
   client = OpenCodeClient()
   respuesta = client.chat("Hola")
   print(respuesta)
   ```

4. **Ejecutar**
   ```bash
   python mi_app.py
   ```

### Tutorial 3: Migrar desde OpenAI

Si ya tienes código usando OpenAI:

1. **Código original**
   ```python
   from openai import OpenAI
   
   client = OpenAI(api_key="sk-...")
   response = client.chat.completions.create(...)
   ```

2. **Iniciar proxy**
   ```bash
   # Terminal 1
   opencode serve
   
   # Terminal 2
   python method2-proxy/proxy_server.py
   ```

3. **Cambiar solo 2 líneas**
   ```python
   from openai import OpenAI
   
   client = OpenAI(
       base_url="http://localhost:8000/v1",  # ← Cambio 1
       api_key="dummy"                        # ← Cambio 2
   )
   response = client.chat.completions.create(...)
   ```

## 🔐 Seguridad y Privacidad

- ✅ Todo corre **localmente** en tu máquina
- ✅ OpenCode Server solo escucha en localhost por defecto
- ✅ No se envían datos a terceros (excepto a OpenCode Zen para el modelo)
- ⚠️  Si expones el servidor a internet, usa autenticación:
  ```bash
  export OPENCODE_SERVER_PASSWORD="tu-password"
  opencode serve
  ```

## 📈 Límites y Consideraciones

### Modelos Gratuitos de OpenCode Zen

- **DeepSeek V4 Flash**: Gratis con límites
- **Límites típicos**: ~100 requests/día (puede variar)
- **Velocidad**: Buena para desarrollo y testing
- **Calidad**: Excelente para código y tareas generales

### Alternativas si Necesitas Más

1. **OpenCode Go** ($10/mes)
   - Límites más altos
   - Acceso a más modelos
   - Mejor para producción

2. **Modelos Locales**
   - Usa Ollama con OpenCode
   - Sin límites
   - Requiere GPU potente

3. **APIs Directas**
   - DeepSeek API (muy barato)
   - Otras alternativas

## 🤝 Contribuir

Este es un proyecto educativo. Mejoras bienvenidas:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## ⚖️ Licencia y Términos

- **Licencia**: MIT
- **Uso**: Personal y educativo
- **Comercial**: Consulta términos de OpenCode
- **Responsabilidad**: Uso bajo tu propia responsabilidad

## 📞 Soporte

- **Documentación**: Lee los README en cada carpeta
- **Issues**: Abre un issue en GitHub
- **OpenCode**: https://opencode.ai/docs
- **Comunidad**: Discord de OpenCode

## 🎉 ¡Listo para Empezar!

```bash
# 1. Instalar
./setup.sh

# 2. Configurar OpenCode
opencode
/connect  # OpenCode Zen
/models   # deepseek/deepseek-v4-flash

# 3. Iniciar servidor
opencode serve

# 4. Probar
python method1-server/test_connection.py

# 5. Usar
python examples/chatbot_simple.py
```

¡Disfruta usando IA gratis en tus proyectos! 🚀
