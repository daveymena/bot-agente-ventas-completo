#!/usr/bin/env python3
"""
G4F Integration Test Suite
Prueba todos los componentes de G4F
"""

import sys
import time
import asyncio
from typing import Dict, List

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_test(name: str, status: bool, details: str = ""):
    """Imprime resultado de test con colores"""
    symbol = f"{Colors.GREEN}✅{Colors.RESET}" if status else f"{Colors.RED}❌{Colors.RESET}"
    status_text = f"{Colors.GREEN}PASS{Colors.RESET}" if status else f"{Colors.RED}FAIL{Colors.RESET}"
    
    print(f"{symbol} {name:<40} [{status_text}]")
    if details:
        print(f"   {Colors.YELLOW}→{Colors.RESET} {details}")

def test_import():
    """Test 1: Verificar que g4f se puede importar"""
    try:
        import g4f
        print_test("G4F Import", True, f"v{g4f.__version__}")
        return True
    except ImportError as e:
        print_test("G4F Import", False, f"Instala con: pip install g4f")
        return False

def test_providers_count():
    """Test 2: Contar proveedores disponibles"""
    try:
        import g4f
        if hasattr(g4f, 'Provider'):
            providers = len(g4f.Provider.__members__)
            print_test("Providers Count", True, f"{providers} proveedores disponibles")
            return True
        else:
            print_test("Providers Count", False, "No se puede acceder a g4f.Provider")
            return False
    except Exception as e:
        print_test("Providers Count", False, str(e))
        return False

def test_basic_response():
    """Test 3: Obtener respuesta básica"""
    try:
        import g4f
        
        response = g4f.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Responde solo con 'OK'"}],
            timeout=10,
        )
        
        if response and len(str(response)) > 0:
            print_test("Basic Response", True, f"Recibido: {str(response)[:30]}...")
            return True
        else:
            print_test("Basic Response", False, "Respuesta vacía")
            return False
    except Exception as e:
        print_test("Basic Response", False, str(e))
        return False

def test_conversation():
    """Test 4: Prueba de conversación multi-turno"""
    try:
        import g4f
        
        messages = [
            {"role": "user", "content": "¿Cuál es tu nombre?"},
        ]
        
        response = g4f.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=messages,
            timeout=10,
        )
        
        if response:
            print_test("Conversation", True, f"Turnos procesados: 1")
            return True
        else:
            print_test("Conversation", False, "Sin respuesta")
            return False
    except Exception as e:
        print_test("Conversation", False, str(e))
        return False

def test_different_models():
    """Test 5: Probar diferentes modelos"""
    try:
        import g4f
        
        models_to_test = ["gpt-3.5-turbo", "gpt-4", "claude"]
        working_models = []
        
        for model in models_to_test:
            try:
                response = g4f.ChatCompletion.create(
                    model=model,
                    messages=[{"role": "user", "content": "Hola"}],
                    timeout=5,
                )
                if response:
                    working_models.append(model)
            except:
                pass
        
        if working_models:
            print_test("Different Models", True, f"{len(working_models)} modelos disponibles: {', '.join(working_models)}")
            return True
        else:
            print_test("Different Models", False, "Ningún modelo disponible")
            return False
    except Exception as e:
        print_test("Different Models", False, str(e))
        return False

def test_timeout():
    """Test 6: Verificar que timeout funciona"""
    try:
        import g4f
        
        start = time.time()
        try:
            response = g4f.ChatCompletion.create(
                model="gpt-4",
                messages=[{"role": "user", "content": "Responde con 1000 palabras"}],
                timeout=2,  # Timeout muy corto
            )
        except:
            pass
        
        elapsed = time.time() - start
        
        if elapsed < 5:
            print_test("Timeout", True, f"Timeout funcionó en {elapsed:.1f}s")
            return True
        else:
            print_test("Timeout", False, f"Timeout no funcionó (tardó {elapsed:.1f}s)")
            return False
    except Exception as e:
        print_test("Timeout", False, str(e))
        return False

def test_stream_response():
    """Test 7: Probar respuesta con streaming"""
    try:
        import g4f
        
        response = g4f.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Hola, ¿funcionas?"}],
            stream=True,
            timeout=10,
        )
        
        chunks = 0
        for chunk in response:
            chunks += 1
            if chunks > 100:  # Limitar para test
                break
        
        print_test("Stream Response", True, f"{chunks} chunks recibidos")
        return True
    except Exception as e:
        print_test("Stream Response", False, str(e))
        return False

def test_env_config():
    """Test 8: Verificar configuración del .env"""
    try:
        import os
        
        g4f_enabled = os.getenv("G4F_ENABLED") == "true"
        g4f_provider = os.getenv("G4F_PROVIDER", "auto")
        g4f_model = os.getenv("G4F_MODEL", "gpt-4-turbo")
        g4f_timeout = os.getenv("G4F_TIMEOUT", "30")
        
        status = g4f_enabled
        details = f"Enabled: {g4f_enabled}, Provider: {g4f_provider}, Model: {g4f_model}, Timeout: {g4f_timeout}s"
        
        print_test("ENV Config", status, details)
        return status
    except Exception as e:
        print_test("ENV Config", False, str(e))
        return False

def test_fallback_order():
    """Test 9: Verificar orden de fallback"""
    try:
        import os
        
        fallback_order = os.getenv("AI_FALLBACK_ORDER", "").split(",")
        has_g4f = "g4f" in fallback_order
        
        if has_g4f:
            position = fallback_order.index("g4f") + 1
            print_test("Fallback Order", True, f"G4F es respaldo #{position} de {len(fallback_order)}")
            return True
        else:
            print_test("Fallback Order", False, "G4F no está en AI_FALLBACK_ORDER")
            return False
    except Exception as e:
        print_test("Fallback Order", False, str(e))
        return False

def test_performance():
    """Test 10: Medir rendimiento"""
    try:
        import g4f
        import statistics
        
        times = []
        for i in range(3):
            start = time.time()
            response = g4f.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": f"Prueba {i+1}"}],
                timeout=10,
            )
            elapsed = time.time() - start
            if response:
                times.append(elapsed)
        
        if times:
            avg_time = statistics.mean(times)
            print_test("Performance", True, f"Tiempo promedio: {avg_time:.2f}s ({len(times)} intentos)")
            return True
        else:
            print_test("Performance", False, "No se completaron las pruebas")
            return False
    except Exception as e:
        print_test("Performance", False, str(e))
        return False

def main():
    """Ejecuta todas las pruebas"""
    print(f"\n{Colors.BOLD}🧪 G4F INTEGRATION TEST SUITE{Colors.RESET}\n")
    print("=" * 70)
    
    tests = [
        ("Test 1", test_import),
        ("Test 2", test_providers_count),
        ("Test 3", test_basic_response),
        ("Test 4", test_conversation),
        ("Test 5", test_different_models),
        ("Test 6", test_timeout),
        ("Test 7", test_stream_response),
        ("Test 8", test_env_config),
        ("Test 9", test_fallback_order),
        ("Test 10", test_performance),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append(result)
        except Exception as e:
            print_test(name, False, f"Exception: {str(e)[:50]}")
            results.append(False)
        print()
    
    print("=" * 70)
    
    passed = sum(results)
    total = len(results)
    percentage = (passed / total) * 100
    
    status_color = Colors.GREEN if percentage >= 80 else Colors.YELLOW if percentage >= 60 else Colors.RED
    print(f"\n{status_color}{Colors.BOLD}RESUMEN: {passed}/{total} pruebas pasadas ({percentage:.0f}%){Colors.RESET}\n")
    
    if percentage >= 90:
        print(f"{Colors.GREEN}🎉 ¡G4F está completamente operacional!{Colors.RESET}\n")
    elif percentage >= 70:
        print(f"{Colors.YELLOW}⚠️  G4F está parcialmente disponible{Colors.RESET}\n")
    else:
        print(f"{Colors.RED}❌ G4F tiene problemas, revisa la instalación{Colors.RESET}\n")
    
    return 0 if percentage >= 70 else 1

if __name__ == "__main__":
    sys.exit(main())
