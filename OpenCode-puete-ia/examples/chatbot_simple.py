#!/usr/bin/env python3
"""
Ejemplo: Chatbot Simple usando OpenCode Bridge
Demuestra cómo crear un chatbot conversacional con los modelos gratuitos
"""

import sys
import os

# Agregar el path del cliente
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'method1-server'))

from client import OpenCodeClient


def print_banner():
    """Imprime el banner del chatbot"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              🤖 Chatbot con OpenCode (Gratis)               ║
║                                                              ║
║  Usando: DeepSeek V4 Flash (Free)                           ║
║  Comandos: /salir, /limpiar, /ayuda                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)


def print_help():
    """Imprime la ayuda"""
    print("""
📚 Comandos disponibles:
   /salir    - Salir del chatbot
   /limpiar  - Limpiar la conversación (nueva sesión)
   /ayuda    - Mostrar esta ayuda
   
💡 Simplemente escribe tu mensaje y presiona Enter
    """)


def main():
    """Función principal del chatbot"""
    print_banner()
    
    # Crear cliente
    print("🔌 Conectando con OpenCode Server...")
    client = OpenCodeClient()
    
    # Verificar conexión
    status = client.check_status()
    if not status.get("connected"):
        print("❌ Error: No se pudo conectar a OpenCode Server")
        print("   Asegúrate de ejecutar: opencode serve")
        sys.exit(1)
    
    print("✅ Conectado exitosamente\n")
    
    # Crear sesión para mantener contexto
    session_id = client.create_session()
    if session_id:
        print(f"📝 Sesión creada: {session_id[:8]}...\n")
    
    print("💬 ¡Listo! Puedes empezar a chatear (escribe /ayuda para ver comandos)\n")
    
    # Loop principal
    while True:
        try:
            # Obtener input del usuario
            user_input = input("Tú: ").strip()
            
            # Comandos especiales
            if user_input.lower() in ['/salir', '/exit', '/quit']:
                print("\n👋 ¡Hasta luego!")
                break
            
            elif user_input.lower() in ['/limpiar', '/clear', '/reset']:
                session_id = client.create_session()
                print("🔄 Conversación limpiada. Nueva sesión iniciada.\n")
                continue
            
            elif user_input.lower() in ['/ayuda', '/help']:
                print_help()
                continue
            
            elif not user_input:
                continue
            
            # Enviar mensaje al modelo
            print("🤖 Bot: ", end="", flush=True)
            
            # Usar streaming para respuesta más natural
            try:
                for chunk in client.chat(user_input, session_id=session_id, stream=True):
                    print(chunk, end="", flush=True)
                print("\n")
            except:
                # Fallback sin streaming
                response = client.chat(user_input, session_id=session_id)
                print(f"{response}\n")
        
        except KeyboardInterrupt:
            print("\n\n👋 ¡Hasta luego!")
            break
        
        except Exception as e:
            print(f"\n❌ Error: {e}\n")


if __name__ == "__main__":
    main()
