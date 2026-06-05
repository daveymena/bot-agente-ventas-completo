#!/usr/bin/env python3
"""
Ejemplo: Generador de Código usando OpenCode Bridge
Demuestra cómo usar el modelo para generar código
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'method1-server'))

from client import OpenCodeClient


def generar_funcion(client, descripcion, lenguaje="Python"):
    """
    Genera una función basada en la descripción
    
    Args:
        client: Cliente de OpenCode
        descripcion: Descripción de lo que debe hacer la función
        lenguaje: Lenguaje de programación
        
    Returns:
        Código generado
    """
    prompt = f"""
Genera una función en {lenguaje} que:
{descripcion}

Requisitos:
- Incluye docstring/comentarios
- Maneja errores apropiadamente
- Usa buenas prácticas
- Solo retorna el código, sin explicaciones adicionales
"""
    
    return client.chat(prompt)


def generar_tests(client, codigo, lenguaje="Python"):
    """
    Genera tests para el código dado
    
    Args:
        client: Cliente de OpenCode
        codigo: Código para el cual generar tests
        lenguaje: Lenguaje de programación
        
    Returns:
        Tests generados
    """
    prompt = f"""
Genera tests unitarios en {lenguaje} para el siguiente código:

```{lenguaje.lower()}
{codigo}
```

Requisitos:
- Usa el framework de testing estándar ({lenguaje})
- Cubre casos normales y edge cases
- Solo retorna el código de los tests
"""
    
    return client.chat(prompt)


def explicar_codigo(client, codigo):
    """
    Explica qué hace un código
    
    Args:
        client: Cliente de OpenCode
        codigo: Código a explicar
        
    Returns:
        Explicación del código
    """
    prompt = f"""
Explica qué hace el siguiente código de forma clara y concisa:

```
{codigo}
```

Incluye:
- Propósito general
- Cómo funciona
- Complejidad temporal si es relevante
"""
    
    return client.chat(prompt)


def refactorizar_codigo(client, codigo, objetivo):
    """
    Refactoriza código según un objetivo
    
    Args:
        client: Cliente de OpenCode
        codigo: Código a refactorizar
        objetivo: Objetivo de la refactorización
        
    Returns:
        Código refactorizado
    """
    prompt = f"""
Refactoriza el siguiente código para: {objetivo}

Código original:
```
{codigo}
```

Retorna solo el código refactorizado con comentarios explicando los cambios.
"""
    
    return client.chat(prompt)


def menu_principal():
    """Muestra el menú principal"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           🔧 Generador de Código con OpenCode               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Opciones:
  1. Generar función
  2. Generar tests
  3. Explicar código
  4. Refactorizar código
  5. Salir

""")


def main():
    """Función principal"""
    # Conectar
    print("🔌 Conectando con OpenCode Server...")
    client = OpenCodeClient()
    
    status = client.check_status()
    if not status.get("connected"):
        print("❌ Error: No se pudo conectar a OpenCode Server")
        print("   Ejecuta: opencode serve")
        sys.exit(1)
    
    print("✅ Conectado\n")
    
    while True:
        menu_principal()
        
        try:
            opcion = input("Selecciona una opción (1-5): ").strip()
            
            if opcion == "1":
                print("\n📝 Generar Función")
                print("-" * 60)
                lenguaje = input("Lenguaje (Python/JavaScript/etc): ").strip() or "Python"
                descripcion = input("Describe qué debe hacer la función:\n> ")
                
                print("\n⏳ Generando código...")
                codigo = generar_funcion(client, descripcion, lenguaje)
                
                print("\n✅ Código generado:")
                print("=" * 60)
                print(codigo)
                print("=" * 60)
            
            elif opcion == "2":
                print("\n🧪 Generar Tests")
                print("-" * 60)
                lenguaje = input("Lenguaje (Python/JavaScript/etc): ").strip() or "Python"
                print("Pega el código (termina con una línea vacía):")
                
                lineas = []
                while True:
                    linea = input()
                    if not linea:
                        break
                    lineas.append(linea)
                
                codigo = "\n".join(lineas)
                
                print("\n⏳ Generando tests...")
                tests = generar_tests(client, codigo, lenguaje)
                
                print("\n✅ Tests generados:")
                print("=" * 60)
                print(tests)
                print("=" * 60)
            
            elif opcion == "3":
                print("\n📖 Explicar Código")
                print("-" * 60)
                print("Pega el código (termina con una línea vacía):")
                
                lineas = []
                while True:
                    linea = input()
                    if not linea:
                        break
                    lineas.append(linea)
                
                codigo = "\n".join(lineas)
                
                print("\n⏳ Analizando código...")
                explicacion = explicar_codigo(client, codigo)
                
                print("\n✅ Explicación:")
                print("=" * 60)
                print(explicacion)
                print("=" * 60)
            
            elif opcion == "4":
                print("\n♻️  Refactorizar Código")
                print("-" * 60)
                objetivo = input("Objetivo de refactorización (ej: mejorar rendimiento): ")
                print("Pega el código (termina con una línea vacía):")
                
                lineas = []
                while True:
                    linea = input()
                    if not linea:
                        break
                    lineas.append(linea)
                
                codigo = "\n".join(lineas)
                
                print("\n⏳ Refactorizando...")
                codigo_nuevo = refactorizar_codigo(client, codigo, objetivo)
                
                print("\n✅ Código refactorizado:")
                print("=" * 60)
                print(codigo_nuevo)
                print("=" * 60)
            
            elif opcion == "5":
                print("\n👋 ¡Hasta luego!")
                break
            
            else:
                print("\n❌ Opción inválida")
            
            input("\nPresiona Enter para continuar...")
            print("\n" * 2)
        
        except KeyboardInterrupt:
            print("\n\n👋 ¡Hasta luego!")
            break
        
        except Exception as e:
            print(f"\n❌ Error: {e}")
            input("\nPresiona Enter para continuar...")


if __name__ == "__main__":
    main()
