# 🔌 Guía de Integración en Proyectos

Esta guía muestra cómo integrar el wrapper de OpenCode en diferentes tipos de proyectos.

## 📦 Integración Básica

### Copiar el Archivo

La forma más simple es copiar `opencode_cli_wrapper.py` a tu proyecto:

```bash
# Copiar el wrapper a tu proyecto
cp opencode_cli_wrapper.py /ruta/a/tu/proyecto/

# O crear un subdirectorio
mkdir /ruta/a/tu/proyecto/opencode_wrapper
cp opencode_cli_wrapper.py /ruta/a/tu/proyecto/opencode_wrapper/
```

### Importar en tu Código

```python
# Si está en el mismo directorio
from opencode_cli_wrapper import OpenCodeCLI

# Si está en un subdirectorio
from opencode_wrapper.opencode_cli_wrapper import OpenCodeCLI

# Usar
client = OpenCodeCLI("opencode.cmd")  # Windows
respuesta = client.chat("Tu pregunta")
```

## 🌐 Integración con Flask (API REST)

### Crear API REST

```python
# app.py
from flask import Flask, request, jsonify
from opencode_cli_wrapper import OpenCodeCLI
import os

app = Flask(__name__)

# Detectar sistema operativo
opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
client = OpenCodeCLI(opencode_cmd)

@app.route('/api/chat', methods=['POST'])
def chat():
    """Endpoint para chat"""
    try:
        data = request.json
        mensaje = data.get('message')
        modelo = data.get('model')  # Opcional
        
        if not mensaje:
            return jsonify({'error': 'Mensaje requerido'}), 400
        
        respuesta = client.chat(mensaje, model=modelo)
        
        return jsonify({
            'success': True,
            'response': respuesta
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/generate-code', methods=['POST'])
def generate_code():
    """Endpoint para generar código"""
    try:
        data = request.json
        descripcion = data.get('description')
        lenguaje = data.get('language', 'Python')
        
        if not descripcion:
            return jsonify({'error': 'Descripción requerida'}), 400
        
        codigo = client.generate_code(descripcion, lenguaje)
        
        return jsonify({
            'success': True,
            'code': codigo
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/explain-code', methods=['POST'])
def explain_code():
    """Endpoint para explicar código"""
    try:
        data = request.json
        codigo = data.get('code')
        
        if not codigo:
            return jsonify({'error': 'Código requerido'}), 400
        
        explicacion = client.explain_code(codigo)
        
        return jsonify({
            'success': True,
            'explanation': explicacion
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

### Instalar Flask

```bash
pip install flask
```

### Ejecutar

```bash
python app.py
```

### Usar la API

```bash
# Chat
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola mundo"}'

# Generar código
curl -X POST http://localhost:5000/api/generate-code \
  -H "Content-Type: application/json" \
  -d '{"description": "función que suma dos números", "language": "Python"}'

# Explicar código
curl -X POST http://localhost:5000/api/explain-code \
  -H "Content-Type: application/json" \
  -d '{"code": "def suma(a, b): return a + b"}'
```

## 🤖 Integración con Discord Bot

```python
# discord_bot.py
import discord
from discord.ext import commands
from opencode_cli_wrapper import OpenCodeCLI
import os

# Configurar bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Cliente OpenCode
opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
client = OpenCodeCLI(opencode_cmd)

@bot.event
async def on_ready():
    print(f'Bot conectado como {bot.user}')

@bot.command(name='ask')
async def ask(ctx, *, pregunta):
    """Comando: !ask <pregunta>"""
    await ctx.send("🤔 Pensando...")
    
    try:
        respuesta = client.chat(pregunta)
        await ctx.send(f"🤖 {respuesta}")
    except Exception as e:
        await ctx.send(f"❌ Error: {e}")

@bot.command(name='code')
async def code(ctx, lenguaje, *, descripcion):
    """Comando: !code <lenguaje> <descripción>"""
    await ctx.send("💻 Generando código...")
    
    try:
        codigo = client.generate_code(descripcion, lenguaje)
        await ctx.send(f"```{lenguaje.lower()}\n{codigo}\n```")
    except Exception as e:
        await ctx.send(f"❌ Error: {e}")

# Ejecutar bot
bot.run('TU_TOKEN_DE_DISCORD')
```

### Instalar discord.py

```bash
pip install discord.py
```

## 📱 Integración con Telegram Bot

```python
# telegram_bot.py
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from opencode_cli_wrapper import OpenCodeCLI
import os

# Cliente OpenCode
opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
client = OpenCodeCLI(opencode_cmd)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /start"""
    await update.message.reply_text(
        '¡Hola! Soy un bot con IA gratuita.\n'
        'Envíame cualquier pregunta y te responderé.'
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Manejar mensajes"""
    mensaje = update.message.text
    
    # Enviar "escribiendo..."
    await update.message.chat.send_action("typing")
    
    try:
        respuesta = client.chat(mensaje)
        await update.message.reply_text(respuesta)
    except Exception as e:
        await update.message.reply_text(f"Error: {e}")

def main():
    # Crear aplicación
    app = Application.builder().token("TU_TOKEN_DE_TELEGRAM").build()
    
    # Agregar handlers
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Iniciar bot
    print("Bot iniciado...")
    app.run_polling()

if __name__ == '__main__':
    main()
```

### Instalar python-telegram-bot

```bash
pip install python-telegram-bot
```

## 🖥️ Integración con Aplicación de Escritorio (Tkinter)

```python
# gui_app.py
import tkinter as tk
from tkinter import scrolledtext, messagebox
from opencode_cli_wrapper import OpenCodeCLI
import os
import threading

class ChatApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Chat con IA Gratis")
        self.root.geometry("600x500")
        
        # Cliente OpenCode
        opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
        self.client = OpenCodeCLI(opencode_cmd)
        
        # Área de chat
        self.chat_area = scrolledtext.ScrolledText(
            root, 
            wrap=tk.WORD, 
            width=70, 
            height=20,
            state='disabled'
        )
        self.chat_area.pack(padx=10, pady=10)
        
        # Entrada de texto
        self.input_frame = tk.Frame(root)
        self.input_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.input_field = tk.Entry(self.input_frame, width=50)
        self.input_field.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.input_field.bind('<Return>', lambda e: self.send_message())
        
        self.send_button = tk.Button(
            self.input_frame, 
            text="Enviar", 
            command=self.send_message
        )
        self.send_button.pack(side=tk.RIGHT, padx=5)
        
    def add_message(self, sender, message):
        """Agregar mensaje al chat"""
        self.chat_area.config(state='normal')
        self.chat_area.insert(tk.END, f"{sender}: {message}\n\n")
        self.chat_area.see(tk.END)
        self.chat_area.config(state='disabled')
    
    def send_message(self):
        """Enviar mensaje"""
        mensaje = self.input_field.get().strip()
        if not mensaje:
            return
        
        # Limpiar input
        self.input_field.delete(0, tk.END)
        
        # Mostrar mensaje del usuario
        self.add_message("Tú", mensaje)
        
        # Deshabilitar botón mientras procesa
        self.send_button.config(state='disabled')
        
        # Procesar en thread separado
        thread = threading.Thread(target=self.get_response, args=(mensaje,))
        thread.start()
    
    def get_response(self, mensaje):
        """Obtener respuesta de IA"""
        try:
            respuesta = self.client.chat(mensaje)
            self.root.after(0, self.add_message, "Bot", respuesta)
        except Exception as e:
            self.root.after(0, messagebox.showerror, "Error", str(e))
        finally:
            self.root.after(0, lambda: self.send_button.config(state='normal'))

if __name__ == '__main__':
    root = tk.Tk()
    app = ChatApp(root)
    root.mainloop()
```

## 🌐 Integración con FastAPI

```python
# fastapi_app.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from opencode_cli_wrapper import OpenCodeCLI
import os

app = FastAPI(title="OpenCode API")

# Cliente OpenCode
opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
client = OpenCodeCLI(opencode_cmd)

class ChatRequest(BaseModel):
    message: str
    model: str = None

class CodeRequest(BaseModel):
    description: str
    language: str = "Python"

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        respuesta = client.chat(request.message, model=request.model)
        return {"response": respuesta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-code")
async def generate_code(request: CodeRequest):
    try:
        codigo = client.generate_code(request.description, request.language)
        return {"code": codigo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Instalar FastAPI

```bash
pip install fastapi uvicorn
```

### Ejecutar

```bash
python fastapi_app.py
```

### Documentación automática

Visita: http://localhost:8000/docs

## 📊 Integración con Jupyter Notebook

```python
# En una celda de Jupyter
from opencode_cli_wrapper import OpenCodeCLI
import os

# Configurar
opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
client = OpenCodeCLI(opencode_cmd)

# Usar
def ask(pregunta):
    """Helper para hacer preguntas"""
    respuesta = client.chat(pregunta)
    print(respuesta)
    return respuesta

# Ejemplo
ask("Explica qué es machine learning")
```

## 🔄 Integración con Scripts Automatizados

```python
# auto_documenter.py
"""
Script que documenta automáticamente archivos Python
"""
from opencode_cli_wrapper import OpenCodeCLI
import os
import sys

def documentar_proyecto(directorio):
    """Documenta todos los archivos .py en un directorio"""
    
    opencode_cmd = "opencode.cmd" if os.name == 'nt' else "opencode"
    client = OpenCodeCLI(opencode_cmd)
    
    for root, dirs, files in os.walk(directorio):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                
                print(f"📝 Documentando: {filepath}")
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        codigo = f.read()
                    
                    prompt = f"Genera documentación detallada para este código Python: {codigo}"
                    docs = client.chat(prompt)
                    
                    # Guardar documentación
                    doc_path = filepath.replace('.py', '.md')
                    with open(doc_path, 'w', encoding='utf-8') as f:
                        f.write(f"# Documentación: {file}\n\n")
                        f.write(docs)
                    
                    print(f"✅ Guardado en: {doc_path}")
                
                except Exception as e:
                    print(f"❌ Error: {e}")

if __name__ == '__main__':
    directorio = sys.argv[1] if len(sys.argv) > 1 else '.'
    documentar_proyecto(directorio)
```

## 📝 Mejores Prácticas

### 1. Manejo de Errores

```python
from opencode_cli_wrapper import OpenCodeCLI
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def chat_seguro(mensaje):
    """Chat con manejo de errores"""
    try:
        client = OpenCodeCLI("opencode.cmd")
        respuesta = client.chat(mensaje, timeout=60)
        return respuesta
    except Exception as e:
        logger.error(f"Error en chat: {e}")
        return "Lo siento, hubo un error. Intenta de nuevo."
```

### 2. Cache de Respuestas

```python
from opencode_cli_wrapper import OpenCodeCLI
from functools import lru_cache

client = OpenCodeCLI("opencode.cmd")

@lru_cache(maxsize=100)
def chat_cached(mensaje):
    """Chat con cache"""
    return client.chat(mensaje)

# Uso
respuesta1 = chat_cached("¿Qué es Python?")  # Llama a OpenCode
respuesta2 = chat_cached("¿Qué es Python?")  # Usa cache
```

### 3. Rate Limiting

```python
from opencode_cli_wrapper import OpenCodeCLI
import time

class RateLimitedClient:
    def __init__(self, requests_per_minute=10):
        self.client = OpenCodeCLI("opencode.cmd")
        self.requests_per_minute = requests_per_minute
        self.last_request_time = 0
    
    def chat(self, mensaje):
        # Esperar si es necesario
        time_since_last = time.time() - self.last_request_time
        min_interval = 60 / self.requests_per_minute
        
        if time_since_last < min_interval:
            time.sleep(min_interval - time_since_last)
        
        self.last_request_time = time.time()
        return self.client.chat(mensaje)

# Uso
client = RateLimitedClient(requests_per_minute=5)
```

## 🎯 Ejemplos Completos

Todos estos ejemplos están disponibles en el repositorio:

- `flask_api.py` - API REST con Flask
- `discord_bot.py` - Bot de Discord
- `telegram_bot.py` - Bot de Telegram
- `gui_app.py` - Aplicación de escritorio
- `fastapi_app.py` - API con FastAPI
- `auto_documenter.py` - Documentador automático

---

**¿Necesitas ayuda con la integración?** Abre un issue en GitHub con tu caso de uso específico.
