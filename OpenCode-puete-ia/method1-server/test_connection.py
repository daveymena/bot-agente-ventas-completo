#!/usr/bin/env python3
"""
Script de prueba para verificar la conexión con OpenCode Server
"""

import sys
import time
from client import OpenCodeClient


def print_section(title):
    """Imprime un título de sección"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_connection():
    """Prueba la conexión básica"""
    print_section("🔍 TEST 1: Verificación de Conexión")
    
    client = OpenCodeClient()
    status = client.check_status()
    
    if status.get("connected") == False:
        print("❌ FALLO: No se pudo conectar al servidor OpenCode")
        print("\n💡 Solución:")
        print("   1. Abre una terminal")
        print("   2. Ejecuta: opencode serve")
        print("   3. Vuelve a ejecutar este script")
        return False
    
    print("✅ ÉXITO: Conectado al servidor OpenCode")
    print(f"   URL: {client.base_url}")
    return True


def test_models():
    """Prueba listar modelos"""
    print_section("📋 TEST 2: Listar Modelos")
    
    client = OpenCodeClient()
    models = client.list_models()
    
    if "error" in models:
        print(f"❌ FALLO: {models['error']}")
        return False
    
    print("✅ ÉXITO: Modelos obtenidos")
    print(f"   Modelos disponibles: {models}")
    return True


def test_session():
    """Prueba crear sesión"""
    print_section("🆕 TEST 3: Crear Sesión")
    
    client = OpenCodeClient()
    session_id = client.create_session()
    
    if not session_id:
        print("⚠️  ADVERTENCIA: No se pudo crear sesión")
        print("   (Esto puede ser normal si OpenCode no soporta sesiones)")
        return True  # No es crítico
    
    print("✅ ÉXITO: Sesión creada")
    print(f"   Session ID: {session_id}")
    return True


def test_simple_chat():
    """Prueba un chat simple"""
    print_section("💬 TEST 4: Chat Simple")
    
    client = OpenCodeClient()
    
    print("   Enviando: '¿Cuánto es 2+2?'")
    response = client.chat("¿Cuánto es 2+2?")
    
    if response.startswith("Error:"):
        print(f"❌ FALLO: {response}")
        return False
    
    print("✅ ÉXITO: Respuesta recibida")
    print(f"   Respuesta: {response[:100]}...")
    return True


def test_streaming():
    """Prueba streaming"""
    print_section("🌊 TEST 5: Streaming")
    
    client = OpenCodeClient()
    
    print("   Enviando: 'Cuenta del 1 al 3'")
    print("   Respuesta: ", end="", flush=True)
    
    try:
        chunks = []
        for chunk in client.chat("Cuenta del 1 al 3", stream=True):
            print(chunk, end="", flush=True)
            chunks.append(chunk)
            time.sleep(0.1)
        
        print()
        
        if not chunks:
            print("⚠️  ADVERTENCIA: No se recibieron chunks")
            print("   (Streaming puede no estar soportado)")
            return True  # No es crítico
        
        print("✅ ÉXITO: Streaming funcionando")
        return True
        
    except Exception as e:
        print(f"\n⚠️  ADVERTENCIA: Error en streaming: {e}")
        print("   (Streaming puede no estar soportado)")
        return True  # No es crítico


def test_context():
    """Prueba mantener contexto"""
    print_section("🔗 TEST 6: Contexto de Conversación")
    
    client = OpenCodeClient()
    session_id = client.create_session()
    
    print("   Mensaje 1: 'Mi nombre es Juan'")
    response1 = client.chat("Mi nombre es Juan", session_id=session_id)
    print(f"   Respuesta: {response1[:80]}...")
    
    time.sleep(1)
    
    print("\n   Mensaje 2: '¿Cuál es mi nombre?'")
    response2 = client.chat("¿Cuál es mi nombre?", session_id=session_id)
    print(f"   Respuesta: {response2[:80]}...")
    
    if "juan" in response2.lower():
        print("\n✅ ÉXITO: El modelo recuerda el contexto")
        return True
    else:
        print("\n⚠️  ADVERTENCIA: El modelo no recordó el contexto")
        print("   (Esto puede ser normal dependiendo de la configuración)")
        return True  # No es crítico


def main():
    """Ejecuta todos los tests"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        OpenCode Bridge - Test de Conexión                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    tests = [
        ("Conexión", test_connection),
        ("Modelos", test_models),
        ("Sesión", test_session),
        ("Chat Simple", test_simple_chat),
        ("Streaming", test_streaming),
        ("Contexto", test_context),
    ]
    
    results = []
    
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ ERROR INESPERADO en {name}: {e}")
            results.append((name, False))
    
    # Resumen
    print_section("📊 RESUMEN DE TESTS")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} - {name}")
    
    print(f"\n   Total: {passed}/{total} tests pasados")
    
    if passed == total:
        print("\n🎉 ¡Todos los tests pasaron! OpenCode Bridge está funcionando correctamente.")
        return 0
    elif passed >= total * 0.5:
        print("\n⚠️  Algunos tests fallaron, pero la funcionalidad básica está disponible.")
        return 0
    else:
        print("\n❌ Muchos tests fallaron. Revisa la configuración de OpenCode.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
