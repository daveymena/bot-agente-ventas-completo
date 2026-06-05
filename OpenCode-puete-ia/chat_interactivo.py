#!/usr/bin/env python3
"""
Chat Interactivo con OpenCode
Prueba los modelos gratuitos de OpenCode de forma interactiva
"""

from opencode_cli_wrapper import OpenCodeCLI
import sys

def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          Chat Interactivo con OpenCode (Gratis)              ║
║                                                              ║
║  Modelo: DeepSeek V4 Flash (Free)                           ║
║  Comandos: 'salir' para terminar                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Crear cliente
    print("🔌 Inicializando OpenCode...")
    try:
        client = OpenCodeCLI("opencode.cmd")  # Windows
        print("✅ Listo para chatear!\n")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    
    # Loop de chat
    while True:
        try:
            # Obtener input del usuario
            user_input = input("Tú: ").strip()
            
            # Comando para salir
            if user_input.lower() in ['salir', 'exit', 'quit']:
                print("\n👋 ¡Hasta luego!")
                break
            
            # Ignorar inputs vacíos
            if not user_input:
                continue
            
            # Enviar mensaje y mostrar respuesta
            print("🤖 Bot: ", end="", flush=True)
            respuesta = client.chat(user_input)
            print(respuesta)
            print()  # Línea en blanco
            
        except KeyboardInterrupt:
            print("\n\n👋 ¡Hasta luego!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}\n")

if __name__ == "__main__":
    main()
