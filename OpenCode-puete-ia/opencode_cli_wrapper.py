#!/usr/bin/env python3
"""
OpenCode CLI Wrapper - Solución Real que Funciona
Usa OpenCode en modo no-interactivo para acceder a los modelos gratuitos
"""

import subprocess
import tempfile
import os
from typing import Optional, List, Dict
import json


class OpenCodeCLI:
    """Wrapper para usar OpenCode CLI desde Python"""
    
    def __init__(
        self, 
        opencode_path: str = "opencode",
        default_model: str = "opencode/deepseek-v4-flash-free"
    ):
        """
        Args:
            opencode_path: Ruta al ejecutable de opencode (default: "opencode" en PATH)
            default_model: Modelo por defecto a usar (default: deepseek-v4-flash-free)
        """
        self.opencode_path = opencode_path
        self.default_model = default_model
        self._verify_installation()
    
    def _verify_installation(self):
        """Verifica que OpenCode esté instalado"""
        try:
            result = subprocess.run(
                [self.opencode_path, "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                raise RuntimeError("OpenCode no responde correctamente")
        except FileNotFoundError:
            raise RuntimeError(
                f"OpenCode no encontrado en: {self.opencode_path}\n"
                "Instala OpenCode desde: https://opencode.ai"
            )
        except Exception as e:
            raise RuntimeError(f"Error verificando OpenCode: {e}")
    
    def chat(
        self, 
        message: str, 
        model: Optional[str] = None,
        timeout: int = 120,
        cwd: Optional[str] = None
    ) -> str:
        """
        Envía un mensaje a OpenCode y retorna la respuesta
        
        Args:
            message: Mensaje a enviar
            model: Modelo a usar (default: self.default_model)
            timeout: Timeout en segundos
            cwd: Directorio de trabajo (opcional)
            
        Returns:
            Respuesta del modelo
        """
        try:
            model_to_use = model or self.default_model
            
            # Usar 'opencode run' con modelo especificado
            cmd = [
                self.opencode_path, 
                "run",
                "--model", model_to_use,
                message
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=cwd,
                encoding='utf-8'
            )
            
            if result.returncode != 0:
                # Intentar extraer mensaje útil del stderr
                error_msg = result.stderr.strip() if result.stderr else "Error desconocido"
                return f"Error (código {result.returncode}): {error_msg}"
            
            return result.stdout.strip()
            
        except subprocess.TimeoutExpired:
            return f"Error: Timeout después de {timeout} segundos"
        except Exception as e:
            return f"Error: {e}"
    
    def chat_with_file(
        self,
        message: str,
        file_path: str,
        timeout: int = 120
    ) -> str:
        """
        Envía un mensaje con contexto de un archivo
        
        Args:
            message: Mensaje a enviar
            file_path: Ruta al archivo para contexto
            timeout: Timeout en segundos
            
        Returns:
            Respuesta del modelo
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                file_content = f.read()
            
            full_message = f"""
Archivo: {file_path}
```
{file_content}
```

{message}
"""
            return self.chat(full_message, timeout=timeout)
            
        except FileNotFoundError:
            return f"Error: Archivo no encontrado: {file_path}"
        except Exception as e:
            return f"Error: {e}"
    
    def chat_conversation(
        self,
        messages: List[Dict[str, str]],
        timeout: int = 120
    ) -> str:
        """
        Envía una conversación completa con contexto
        
        Args:
            messages: Lista de mensajes [{"role": "user/assistant", "content": "..."}]
            timeout: Timeout en segundos
            
        Returns:
            Respuesta del modelo
        """
        # Construir contexto de conversación
        context_parts = []
        for msg in messages[:-1]:  # Todos menos el último
            role = "Usuario" if msg["role"] == "user" else "Asistente"
            context_parts.append(f"{role}: {msg['content']}")
        
        # El último mensaje es la pregunta actual
        last_message = messages[-1]["content"]
        
        if context_parts:
            full_message = "\n".join(context_parts) + f"\n\nUsuario: {last_message}"
        else:
            full_message = last_message
        
        return self.chat(full_message, timeout=timeout)
    
    def generate_code(
        self,
        description: str,
        language: str = "Python",
        timeout: int = 120
    ) -> str:
        """
        Genera código basado en una descripción
        
        Args:
            description: Descripción de lo que debe hacer el código
            language: Lenguaje de programación
            timeout: Timeout en segundos
            
        Returns:
            Código generado
        """
        prompt = f"Genera código en {language} que: {description}. Requisitos: Solo retorna el código, sin explicaciones. Incluye comentarios en el código. Usa buenas prácticas."
        return self.chat(prompt, timeout=timeout)
    
    def explain_code(
        self,
        code: str,
        timeout: int = 120
    ) -> str:
        """
        Explica qué hace un código
        
        Args:
            code: Código a explicar
            timeout: Timeout en segundos
            
        Returns:
            Explicación del código
        """
        prompt = f"Explica qué hace este código de forma clara: {code}. Incluye: propósito general, cómo funciona, y complejidad si es relevante."
        return self.chat(prompt, timeout=timeout)


# ─── Ejemplos de Uso ───────────────────────────────────────────────────────────

def ejemplo_basico():
    """Ejemplo básico de chat"""
    print("="*60)
    print("Ejemplo 1: Chat Básico")
    print("="*60)
    
    client = OpenCodeCLI("opencode.cmd")  # Windows
    
    respuesta = client.chat("¿Cuánto es 2+2? Responde solo el número.")
    print(f"Pregunta: ¿Cuánto es 2+2?")
    print(f"Respuesta: {respuesta}\n")


def ejemplo_conversacion():
    """Ejemplo de conversación con contexto"""
    print("="*60)
    print("Ejemplo 2: Conversación con Contexto")
    print("="*60)
    
    client = OpenCodeCLI("opencode.cmd")  # Windows
    
    messages = [
        {"role": "user", "content": "Mi lenguaje favorito es Python"},
        {"role": "assistant", "content": "Entendido, Python es tu lenguaje favorito."},
        {"role": "user", "content": "¿Cuál es mi lenguaje favorito?"}
    ]
    
    respuesta = client.chat_conversation(messages)
    print("Conversación:")
    for msg in messages:
        print(f"  {msg['role']}: {msg['content']}")
    print(f"\nRespuesta: {respuesta}\n")


def ejemplo_generar_codigo():
    """Ejemplo de generación de código"""
    print("="*60)
    print("Ejemplo 3: Generar Código")
    print("="*60)
    
    client = OpenCodeCLI("opencode.cmd")  # Windows
    
    codigo = client.generate_code(
        description="Recibe una lista de números y retorna solo los pares",
        language="Python"
    )
    
    print("Descripción: Recibe una lista de números y retorna solo los pares")
    print(f"\nCódigo generado:\n{codigo}\n")


def ejemplo_explicar_codigo():
    """Ejemplo de explicación de código"""
    print("="*60)
    print("Ejemplo 4: Explicar Código")
    print("="*60)
    
    client = OpenCodeCLI("opencode.cmd")  # Windows
    
    codigo_ejemplo = "def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)"
    
    explicacion = client.explain_code(codigo_ejemplo)
    print(f"Código: {codigo_ejemplo}")
    print(f"\nExplicación:\n{explicacion}\n")


def main():
    """Ejecuta todos los ejemplos"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         OpenCode CLI Wrapper - Ejemplos de Uso              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    try:
        ejemplo_basico()
        ejemplo_conversacion()
        ejemplo_generar_codigo()
        ejemplo_explicar_codigo()
        
        print("="*60)
        print("✅ Todos los ejemplos completados exitosamente")
        print("="*60)
        
    except RuntimeError as e:
        print(f"\n❌ Error: {e}")
        print("\nAsegúrate de que OpenCode esté instalado:")
        print("  curl -fsSL https://opencode.ai/install.sh | sh")
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")


if __name__ == "__main__":
    main()
