#!/usr/bin/env python3
"""
OpenCode CLI Wrapper — Servidor Persistente para Máxima Velocidad
Inicia opencode serve una sola vez y reutiliza la conexión en cada petición,
eliminando el costo de arranque de Node.js por cada llamada (~1-2 segundos).
Compatible con server.py (endpoints /api/chat y /v1/chat/completions).
"""

import subprocess
import os
import socket  # ya importado abajo, pero aquí por compatibilidad
import time
import socket
import atexit
from typing import Optional, List, Dict
import logging

logger = logging.getLogger(__name__)


def resolve_upstream_base_url() -> str:
    """Retorna la URL base del upstream (compatibilidad con server.py)."""
    return os.environ.get("OPENCODE_ZEN_BASE_URL") or "https://opencode.ai/zen/v1"


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def _port_is_open(port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=timeout):
            return True
    except OSError:
        return False


def _normalize_model(model: str) -> str:
    if model.startswith("opencode/"):
        return model
    return f"opencode/{model}"


class OpenCodeCLI:
    """
    Wrapper para OpenCode CLI con servidor persistente.

    Al inicializarse arranca 'opencode serve' en background una sola vez.
    Todas las peticiones de chat se hacen vía 'opencode run --attach',
    que reutiliza el proceso ya calentado y elimina el overhead de arranque
    de Node.js (~1-2s por petición).
    """

    def __init__(
        self,
        opencode_path: str = "opencode",
        default_model: str = "opencode/deepseek-v4-flash-free"
    ):
        self.opencode_path = opencode_path
        self.default_model = _normalize_model(default_model)
        self._server_proc: Optional[subprocess.Popen] = None
        self._server_url: Optional[str] = None
        self._use_attach: bool = False

        self.zen_status = {"ok": True, "status": "connected", "model_count": 0, "models": []}

        self._verify_installation()
        self._start_persistent_server()
        self.base_url = self._server_url or "http://127.0.0.1:0"

    # ──────────────────────────────────────────────────────────
    # Ciclo de vida del servidor persistente
    # ──────────────────────────────────────────────────────────

    def _verify_installation(self):
        try:
            result = subprocess.run(
                [self.opencode_path, "--version"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode != 0:
                raise RuntimeError("OpenCode no responde correctamente")
        except FileNotFoundError:
            raise RuntimeError(
                f"OpenCode no encontrado en: {self.opencode_path}\n"
                "Instala OpenCode desde: https://opencode.ai"
            )

    def _start_persistent_server(self):
        try:
            port = _find_free_port()
            cmd = [
                self.opencode_path, "serve",
                "--port", str(port),
                "--pure"
            ]

            self._server_proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
            )

            deadline = time.time() + 8
            ready = False
            while time.time() < deadline:
                if _port_is_open(port):
                    ready = True
                    break
                time.sleep(0.3)

            if ready:
                self._server_url = f"http://127.0.0.1:{port}"
                self._use_attach = True
                logger.info(f"OpenCode persistent server started on {self._server_url}")
                atexit.register(self._stop_persistent_server)
            else:
                logger.warning("OpenCode server did not become ready — falling back to per-request mode")
                self._server_proc.terminate()
                self._server_proc = None

        except Exception as e:
            logger.warning(f"Could not start OpenCode persistent server: {e} — using per-request mode")
            self._server_proc = None

    def _stop_persistent_server(self):
        if self._server_proc:
            try:
                self._server_proc.terminate()
                self._server_proc.wait(timeout=5)
            except Exception:
                pass
            self._server_proc = None

    # ──────────────────────────────────────────────────────────
    # Subprocess helper
    # ──────────────────────────────────────────────────────────

    def _run_subprocess(self, cmd: list, timeout: int, cwd: Optional[str] = None) -> str:
        proc = None
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                encoding='utf-8',
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
            )
            stdout, stderr = proc.communicate(timeout=timeout)
            if proc.returncode != 0:
                err = stderr.strip() if stderr else f"Código {proc.returncode}"
                raise RuntimeError(err)
            return stdout.strip()
        except subprocess.TimeoutExpired:
            if proc:
                try:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True, timeout=5)
                    else:
                        proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass
            raise RuntimeError(f"Timeout después de {timeout} segundos")
        except FileNotFoundError:
            raise RuntimeError(f"Comando no encontrado: {cmd[0]}")

    def _chat_via_server(self, message: str, model: str, timeout: int, cwd: Optional[str]) -> str:
        cmd = [
            self.opencode_path, "run",
            "--attach", self._server_url,
            "--pure",
            "--dangerously-skip-permissions",
            "--model", model,
            message
        ]
        return self._run_subprocess(cmd, timeout, cwd)

    def _chat_direct(self, message: str, model: str, timeout: int, cwd: Optional[str]) -> str:
        cmd = [
            self.opencode_path, "run",
            "--pure",
            "--dangerously-skip-permissions",
            "--model", model,
            message
        ]
        return self._run_subprocess(cmd, timeout, cwd)

    # ──────────────────────────────────────────────────────────
    # Métodos públicos
    # ──────────────────────────────────────────────────────────

    def chat(
        self,
        message: str,
        model: Optional[str] = None,
        timeout: int = 120,
        cwd: Optional[str] = None
    ) -> str:
        model_to_use = _normalize_model(model or self.default_model)

        if self._use_attach and self._server_url:
            try:
                return self._chat_via_server(message, model_to_use, timeout, cwd)
            except Exception as e:
                logger.warning(f"Attached chat failed ({e}), falling back to direct mode")
                self._use_attach = False

        return self._chat_direct(message, model_to_use, timeout, cwd)

    def chat_with_file(self, message: str, file_path: str, timeout: int = 120) -> str:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                file_content = f.read()
            full_message = f"Archivo: {file_path}\n```\n{file_content}\n```\n\n{message}"
            return self.chat(full_message, timeout=timeout)
        except FileNotFoundError:
            return f"Error: Archivo no encontrado: {file_path}"
        except Exception as e:
            return f"Error: {e}"

    def chat_conversation(self, messages: List[Dict[str, str]], timeout: int = 120) -> str:
        context_parts = []
        for msg in messages[:-1]:
            role = "Usuario" if msg["role"] == "user" else "Asistente"
            context_parts.append(f"{role}: {msg['content']}")
        last_message = messages[-1]["content"]
        if context_parts:
            full_message = "\n".join(context_parts) + f"\n\nUsuario: {last_message}"
        else:
            full_message = last_message
        return self.chat(full_message, timeout=timeout)

    def complete_messages(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        timeout: int = 120,
    ) -> str:
        """OpenAI messages[] → prompt → opencode run."""
        return self.chat_conversation(messages, timeout=timeout)

    def generate_code(self, description: str, language: str = "Python", timeout: int = 120) -> str:
        prompt = (
            f"Genera código en {language} que: {description}. "
            "Solo retorna el código, sin explicaciones. "
            "Incluye comentarios y usa buenas prácticas."
        )
        return self.chat(prompt, timeout=timeout)

    def explain_code(self, code: str, timeout: int = 120) -> str:
        prompt = (
            f"Explica qué hace este código de forma clara: {code}. "
            "Incluye: propósito general, cómo funciona, y complejidad si es relevante."
        )
        return self.chat(prompt, timeout=timeout)


# ─── Prueba rápida ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import time as _t

    print("Iniciando cliente OpenCode (modo servidor persistente)...")
    client = OpenCodeCLI("opencode.cmd" if os.name == 'nt' else "opencode")
    modo = "SERVIDOR PERSISTENTE (--attach)" if client._use_attach else "PROCESO POR PETICION (fallback)"
    print(f"Modo activo: {modo}\n")

    for i in range(1, 4):
        t = _t.time()
        resp = client.chat(f"Responde solo la letra del turno {i}: A, B o C.")
        elapsed = _t.time() - t
        print(f"Turno {i} → {resp!r}  [{elapsed:.2f}s]")
