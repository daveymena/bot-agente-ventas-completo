#!/usr/bin/env python3
"""
Cliente Python para OpenCode Server
Usa la API real de OpenCode (descubierta desde la documentación oficial del SDK)
Endpoints reales: /session, /session/{id}/prompt, /event, etc.
"""

import requests
import json
from typing import Optional, Dict, Any, Generator
import sys


class OpenCodeClient:
    """Cliente para interactuar con OpenCode Server usando su API real"""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:4096",
        password: Optional[str] = None,
        timeout: int = 60
    ):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session_http = requests.Session()
        self.session_http.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
        })
        if password:
            self.session_http.auth = ('opencode', password)

    # ─── Health ────────────────────────────────────────────────────────────────

    def check_status(self) -> Dict[str, Any]:
        """GET /global/health"""
        try:
            r = self.session_http.get(f"{self.base_url}/global/health", timeout=5)
            if r.ok:
                data = r.json()
                data["connected"] = True
                return data
            return {"connected": False, "status_code": r.status_code}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    # ─── Config / Providers ────────────────────────────────────────────────────

    def list_providers(self) -> Dict[str, Any]:
        """GET /config/providers"""
        try:
            r = self.session_http.get(f"{self.base_url}/config/providers", timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    def get_config(self) -> Dict[str, Any]:
        """GET /config"""
        try:
            r = self.session_http.get(f"{self.base_url}/config", timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    # ─── Sessions ──────────────────────────────────────────────────────────────

    def list_sessions(self) -> list:
        """GET /session"""
        try:
            r = self.session_http.get(f"{self.base_url}/session", timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return []

    def create_session(self, title: str = "Bridge Session") -> Optional[str]:
        """POST /session  →  retorna el ID de la sesión creada"""
        try:
            r = self.session_http.post(
                f"{self.base_url}/session",
                json={"title": title},
                timeout=10
            )
            r.raise_for_status()
            data = r.json()
            # La respuesta puede ser el objeto sesión directamente o envuelto
            if isinstance(data, dict):
                return data.get("id") or data.get("data", {}).get("id")
            return None
        except Exception as e:
            print(f"[create_session error] {e}")
            return None

    def delete_session(self, session_id: str) -> bool:
        """DELETE /session/{id}"""
        try:
            r = self.session_http.delete(
                f"{self.base_url}/session/{session_id}",
                timeout=10
            )
            return r.ok
        except Exception:
            return False

    # ─── Prompt / Chat ─────────────────────────────────────────────────────────

    def chat(
        self,
        message: str,
        session_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        model_id: Optional[str] = None,
        stream: bool = False
    ) -> Any:
        """
        Envía un mensaje a OpenCode y retorna la respuesta.

        POST /session/{id}/prompt
        body: {
            parts: [{ type: "text", text: "..." }],
            model: { providerID: "...", modelID: "..." }   # opcional
        }

        Si stream=True retorna un generador de chunks de texto.
        """
        # Crear sesión si no se proporcionó
        if not session_id:
            session_id = self.create_session()
            if not session_id:
                return "Error: no se pudo crear sesión"

        body: Dict[str, Any] = {
            "parts": [{"type": "text", "text": message}]
        }

        if model_provider and model_id:
            body["model"] = {"providerID": model_provider, "modelID": model_id}

        try:
            r = self.session_http.post(
                f"{self.base_url}/session/{session_id}/prompt",
                json=body,
                timeout=self.timeout,
                stream=stream
            )
            r.raise_for_status()

            if stream:
                return self._stream_response(r)

            data = r.json()
            return self._extract_text(data)

        except requests.exceptions.HTTPError as e:
            return f"HTTP Error {e.response.status_code}: {e.response.text[:200]}"
        except Exception as e:
            return f"Error: {e}"

    def _extract_text(self, data: Any) -> str:
        """Extrae el texto de la respuesta de OpenCode"""
        if isinstance(data, str):
            return data

        if isinstance(data, dict):
            # Estructura: { info: {...}, parts: [...] }
            parts = data.get("parts", [])
            if parts:
                texts = []
                for part in parts:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            texts.append(part.get("text", ""))
                        elif "text" in part:
                            texts.append(part["text"])
                if texts:
                    return "\n".join(texts)

            # Fallback: buscar campos comunes
            for key in ("text", "content", "message", "response", "output"):
                if key in data:
                    return str(data[key])

        return json.dumps(data, ensure_ascii=False)

    def _stream_response(self, response) -> Generator[str, None, None]:
        """Itera sobre una respuesta SSE/streaming de OpenCode"""
        for line in response.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8") if isinstance(line, bytes) else line
            # SSE: "data: {...}"
            if decoded.startswith("data:"):
                payload = decoded[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    obj = json.loads(payload)
                    text = self._extract_text(obj)
                    if text:
                        yield text
                except json.JSONDecodeError:
                    yield payload
            else:
                try:
                    obj = json.loads(decoded)
                    text = self._extract_text(obj)
                    if text:
                        yield text
                except json.JSONDecodeError:
                    yield decoded

    # ─── Messages ──────────────────────────────────────────────────────────────

    def get_messages(self, session_id: str) -> list:
        """GET /session/{id}/message"""
        try:
            r = self.session_http.get(
                f"{self.base_url}/session/{session_id}/message",
                timeout=10
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return []


# ─── Demo ──────────────────────────────────────────────────────────────────────

def main():
    client = OpenCodeClient()

    print("🔍 Verificando conexión...")
    status = client.check_status()
    if not status.get("connected"):
        print(f"❌ Sin conexión: {status}")
        sys.exit(1)
    print(f"✅ Conectado  →  {status}")

    print("\n📋 Providers disponibles:")
    providers = client.list_providers()
    print(json.dumps(providers, indent=2, ensure_ascii=False)[:800])

    print("\n🆕 Creando sesión...")
    sid = client.create_session("Demo Bridge")
    print(f"   Session ID: {sid}")

    if sid:
        print("\n💬 Enviando mensaje...")
        resp = client.chat("¿Cuánto es 2+2? Responde solo el número.", session_id=sid)
        print(f"   Respuesta: {resp}")

        # Limpiar
        client.delete_session(sid)
        print("\n🗑️  Sesión eliminada")


if __name__ == "__main__":
    main()
