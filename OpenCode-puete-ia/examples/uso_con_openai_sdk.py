#!/usr/bin/env python3
"""
Ejemplo: Usar OpenCode con el SDK de OpenAI
Demuestra cómo usar el proxy para trabajar con código existente de OpenAI
"""

# Nota: Requiere tener instalado: pip install openai

try:
    from openai import OpenAI
except ImportError:
    print("❌ Error: Necesitas instalar el SDK de OpenAI")
    print("   Ejecuta: pip install openai")
    exit(1)


def ejemplo_basico():
    """Ejemplo básico de chat"""
    print("\n" + "="*60)
    print("📝 Ejemplo 1: Chat Básico")
    print("="*60)
    
    # Crear cliente apuntando al proxy local
    # ¡No necesitas una API key real!
    client = OpenAI(
        base_url="http://localhost:8000/v1",
        api_key="dummy-key-not-needed"
    )
    
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=[
            {"role": "user", "content": "Explica qué es una API REST en 2 líneas"}
        ]
    )
    
    print(f"Respuesta: {response.choices[0].message.content}")


def ejemplo_streaming():
    """Ejemplo con streaming"""
    print("\n" + "="*60)
    print("🌊 Ejemplo 2: Streaming")
    print("="*60)
    
    client = OpenAI(
        base_url="http://localhost:8000/v1",
        api_key="dummy"
    )
    
    print("Pregunta: Cuenta del 1 al 5")
    print("Respuesta: ", end="", flush=True)
    
    stream = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=[
            {"role": "user", "content": "Cuenta del 1 al 5"}
        ],
        stream=True
    )
    
    for chunk in stream:
        if chunk.choices[0].delta.content:
            print(chunk.choices[0].delta.content, end="", flush=True)
    
    print()


def ejemplo_conversacion():
    """Ejemplo de conversación con contexto"""
    print("\n" + "="*60)
    print("💬 Ejemplo 3: Conversación con Contexto")
    print("="*60)
    
    client = OpenAI(
        base_url="http://localhost:8000/v1",
        api_key="dummy"
    )
    
    # Mantener historial de mensajes
    messages = []
    
    # Mensaje 1
    messages.append({"role": "user", "content": "Mi color favorito es el azul"})
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=messages
    )
    assistant_msg = response.choices[0].message.content
    messages.append({"role": "assistant", "content": assistant_msg})
    
    print(f"Usuario: Mi color favorito es el azul")
    print(f"Asistente: {assistant_msg}")
    
    # Mensaje 2 (referencia al contexto)
    messages.append({"role": "user", "content": "¿Cuál es mi color favorito?"})
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=messages
    )
    
    print(f"\nUsuario: ¿Cuál es mi color favorito?")
    print(f"Asistente: {response.choices[0].message.content}")


def ejemplo_generacion_codigo():
    """Ejemplo de generación de código"""
    print("\n" + "="*60)
    print("🔧 Ejemplo 4: Generación de Código")
    print("="*60)
    
    client = OpenAI(
        base_url="http://localhost:8000/v1",
        api_key="dummy"
    )
    
    response = client.chat.completions.create(
        model="deepseek-v4-flash",
        messages=[
            {
                "role": "system",
                "content": "Eres un experto programador. Genera código limpio y bien documentado."
            },
            {
                "role": "user",
                "content": """
Crea una función en Python que:
- Reciba una lista de números
- Retorne la mediana
- Maneje listas vacías
"""
            }
        ]
    )
    
    print("Código generado:")
    print("-" * 60)
    print(response.choices[0].message.content)
    print("-" * 60)


def ejemplo_con_langchain():
    """Ejemplo usando LangChain"""
    print("\n" + "="*60)
    print("🦜 Ejemplo 5: Integración con LangChain")
    print("="*60)
    
    try:
        from langchain_openai import ChatOpenAI
        from langchain.schema import HumanMessage, SystemMessage
    except ImportError:
        print("⚠️  Necesitas instalar LangChain:")
        print("   pip install langchain langchain-openai")
        return
    
    # Crear modelo apuntando al proxy
    llm = ChatOpenAI(
        base_url="http://localhost:8000/v1",
        api_key="dummy",
        model="deepseek-v4-flash"
    )
    
    messages = [
        SystemMessage(content="Eres un asistente útil"),
        HumanMessage(content="¿Qué es Python?")
    ]
    
    response = llm.invoke(messages)
    print(f"Respuesta: {response.content}")


def verificar_proxy():
    """Verifica que el proxy esté corriendo"""
    import requests
    
    try:
        response = requests.get("http://localhost:8000/health", timeout=2)
        if response.ok:
            return True
    except:
        pass
    
    return False


def main():
    """Función principal"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     Ejemplos de Uso con SDK de OpenAI (Proxy OpenCode)      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Verificar que el proxy esté corriendo
    print("🔍 Verificando proxy...")
    if not verificar_proxy():
        print("""
❌ El proxy no está corriendo

Para iniciar el proxy:
  1. Terminal 1: opencode serve
  2. Terminal 2: python method2-proxy/proxy_server.py
  3. Terminal 3: python examples/uso_con_openai_sdk.py

""")
        return
    
    print("✅ Proxy detectado\n")
    
    try:
        # Ejecutar ejemplos
        ejemplo_basico()
        ejemplo_streaming()
        ejemplo_conversacion()
        ejemplo_generacion_codigo()
        ejemplo_con_langchain()
        
        print("\n" + "="*60)
        print("✅ Todos los ejemplos completados")
        print("="*60)
        
        print("""
💡 Ventajas de usar el proxy:
   - Compatible con código existente de OpenAI
   - Funciona con LangChain, LlamaIndex, etc.
   - Solo cambias la base_url
   - ¡Gratis usando modelos de OpenCode!
        """)
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nAsegúrate de que:")
        print("  1. opencode serve esté corriendo")
        print("  2. El proxy esté corriendo (python method2-proxy/proxy_server.py)")


if __name__ == "__main__":
    main()
