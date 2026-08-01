#!/usr/bin/env python3
"""
Sistema de Autenticación y Gestión de API Keys
Genera, valida y gestiona tokens para acceso a la API
"""

import secrets
import json
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import hashlib
import sqlite3
from pathlib import Path


class AuthManager:
    """Gestor de autenticación y API keys"""
    
    def __init__(self, db_path: str = "data/auth.db"):
        """
        Inicializa el gestor de autenticación
        
        Args:
            db_path: Ruta a la base de datos SQLite
        """
        self.db_path = db_path
        self._ensure_db_exists()
    
    def _ensure_db_exists(self):
        """Crea la base de datos si no existe"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Tabla de API keys
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_hash TEXT UNIQUE NOT NULL,
                key_prefix TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP,
                expires_at TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                rate_limit INTEGER DEFAULT 60,
                usage_count INTEGER DEFAULT 0,
                owner TEXT NOT NULL,
                raw_key TEXT
            )
        """)
        
        # Tabla de uso/logs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                status_code INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                response_time_ms INTEGER,
                FOREIGN KEY (key_id) REFERENCES api_keys(id)
            )
        """)
        
        # Tabla de usuarios
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_admin BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1
            )
        """)
        
        # Migración: Verificar si la columna raw_key existe en api_keys
        cursor.execute("PRAGMA table_info(api_keys)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'raw_key' not in columns:
            cursor.execute("ALTER TABLE api_keys ADD COLUMN raw_key TEXT")
            
        # Auto-seed: Crear usuario admin por defecto si no existe.
        # Antes: password fijo "admin123" hardcodeado. Ahora sale de
        # OPENCODE_PROXY_ADMIN_PASSWORD -- si no está seteada, se genera una
        # temporal random y se avisa por consola (mismo patrón que el
        # auto-seed del admin en artifacts/api-server/src/app.ts).
        cursor.execute("SELECT id FROM users WHERE username = 'admin'")
        if not cursor.fetchone():
            admin_password = os.environ.get("OPENCODE_PROXY_ADMIN_PASSWORD")
            if not admin_password:
                admin_password = secrets.token_hex(12)
                print(f"⚠️  OPENCODE_PROXY_ADMIN_PASSWORD no seteada -- se generó una temporal, cámbiala tras el primer login: {admin_password}")
            password_hash = hashlib.sha256(admin_password.encode()).hexdigest()
            cursor.execute("""
                INSERT INTO users (username, password_hash, email, is_admin)
                VALUES ('admin', ?, 'admin@opencode.local', 1)
            """, (password_hash,))

        # Auto-seed: claves fijas del usuario, si se proveen por entorno.
        # Antes: dos API keys reales hardcodeadas acá mismo, en texto plano,
        # en un repo público. Ahora salen de OPENCODE_PROXY_SEED_KEYS (una o
        # más, separadas por coma) -- si no está seteada, no se siembra
        # ninguna clave fija (las keys se siguen pudiendo generar/gestionar
        # normalmente desde la app).
        seed_keys_env = os.environ.get("OPENCODE_PROXY_SEED_KEYS", "")
        default_keys = [
            (key.strip(), f"Clave Principal {i + 1}")
            for i, key in enumerate(seed_keys_env.split(",")) if key.strip()
        ]

        for fixed_key, key_name in default_keys:
            fixed_hash = hashlib.sha256(fixed_key.encode()).hexdigest()
            # Verificar si la clave fija o su hash ya están
            cursor.execute("SELECT id FROM api_keys WHERE key_hash = ? OR raw_key = ?", (fixed_hash, fixed_key))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO api_keys 
                    (key_hash, key_prefix, name, description, rate_limit, owner, raw_key)
                    VALUES (?, ?, ?, 'Clave provista por el usuario', 1000, 'admin', ?)
                """, (fixed_hash, fixed_key[:16] + "...", key_name, fixed_key))
            
        conn.commit()
        conn.close()
    
    def _hash_key(self, key: str) -> str:
        """Hashea una API key"""
        return hashlib.sha256(key.encode()).hexdigest()
    
    def _hash_password(self, password: str) -> str:
        """Hashea una contraseña"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def generate_api_key(
        self,
        name: str,
        owner: str,
        description: str = "",
        expires_in_days: Optional[int] = None,
        rate_limit: int = 60
    ) -> Tuple[str, str]:
        """
        Genera una nueva API key
        
        Args:
            name: Nombre descriptivo de la key
            owner: Propietario de la key
            description: Descripción opcional
            expires_in_days: Días hasta que expire (None = nunca)
            rate_limit: Límite de requests por minuto
            
        Returns:
            Tupla (api_key_completa, key_prefix_para_mostrar)
        """
        # Generar key aleatoria
        api_key = f"sk_{secrets.token_urlsafe(32)}"
        key_prefix = api_key[:20] + "..."
        key_hash = self._hash_key(api_key)
        
        # Calcular fecha de expiración
        expires_at = None
        if expires_in_days:
            expires_at = (datetime.utcnow() + timedelta(days=expires_in_days)).isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO api_keys 
                (key_hash, key_prefix, name, description, expires_at, rate_limit, owner, raw_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (key_hash, key_prefix, name, description, expires_at, rate_limit, owner, api_key))
            
            conn.commit()
            return api_key, key_prefix
        
        except sqlite3.IntegrityError as e:
            raise ValueError(f"Error al crear API key: {e}")
        
        finally:
            conn.close()
    
    def validate_api_key(self, api_key: str) -> Tuple[bool, Optional[Dict]]:
        """
        Valida una API key
        
        Args:
            api_key: API key a validar
            
        Returns:
            Tupla (es_válida, datos_de_la_key)
        """
        key_hash = self._hash_key(api_key)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, name, owner, is_active, expires_at, rate_limit, usage_count
                FROM api_keys
                WHERE key_hash = ?
            """, (key_hash,))
            
            result = cursor.fetchone()
            
            if not result:
                return False, None
            
            key_id, name, owner, is_active, expires_at, rate_limit, usage_count = result
            
            # Verificar si está activa
            if not is_active:
                return False, None
            
            # Verificar si ha expirado
            if expires_at:
                if datetime.fromisoformat(expires_at) < datetime.utcnow():
                    return False, None
            
            # Actualizar último uso
            cursor.execute("""
                UPDATE api_keys
                SET last_used = CURRENT_TIMESTAMP, usage_count = usage_count + 1
                WHERE id = ?
            """, (key_id,))
            
            conn.commit()
            
            return True, {
                'id': key_id,
                'name': name,
                'owner': owner,
                'rate_limit': rate_limit,
                'usage_count': usage_count
            }
        
        finally:
            conn.close()
    
    def revoke_api_key(self, api_key: str) -> bool:
        """
        Revoca una API key
        
        Args:
            api_key: API key a revocar
            
        Returns:
            True si se revocó exitosamente
        """
        key_hash = self._hash_key(api_key)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                UPDATE api_keys
                SET is_active = 0
                WHERE key_hash = ?
            """, (key_hash,))
            
            conn.commit()
            return cursor.rowcount > 0
        
        finally:
            conn.close()
    
    def revoke_api_key_by_prefix(self, key_prefix: str) -> bool:
        """
        Revoca una API key por su prefijo
        
        Args:
            key_prefix: Prefijo de la API key a revocar
            
        Returns:
            True si se revocó exitosamente
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                UPDATE api_keys
                SET is_active = 0
                WHERE key_prefix = ?
            """, (key_prefix,))
            
            conn.commit()
            return cursor.rowcount > 0
        
        finally:
            conn.close()
    
    def list_api_keys(self, owner: str) -> List[Dict]:
        """
        Lista todas las API keys de un propietario
        
        Args:
            owner: Propietario
            
        Returns:
            Lista de API keys
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, key_prefix, name, description, created_at, 
                       last_used, expires_at, is_active, rate_limit, usage_count, raw_key
                FROM api_keys
                WHERE owner = ?
                ORDER BY created_at DESC
            """, (owner,))
            
            keys = []
            for row in cursor.fetchall():
                keys.append({
                    'id': row[0],
                    'key_prefix': row[1],
                    'name': row[2],
                    'description': row[3],
                    'created_at': row[4],
                    'last_used': row[5],
                    'expires_at': row[6],
                    'is_active': bool(row[7]),
                    'rate_limit': row[8],
                    'usage_count': row[9],
                    'raw_key': row[10]
                })
            
            return keys
        
        finally:
            conn.close()
    
    def get_api_key_stats(self, api_key: str) -> Optional[Dict]:
        """
        Obtiene estadísticas de una API key
        
        Args:
            api_key: API key
            
        Returns:
            Estadísticas de la key
        """
        key_hash = self._hash_key(api_key)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Obtener info de la key
            cursor.execute("""
                SELECT id, name, created_at, last_used, usage_count
                FROM api_keys
                WHERE key_hash = ?
            """, (key_hash,))
            
            result = cursor.fetchone()
            if not result:
                return None
            
            key_id, name, created_at, last_used, usage_count = result
            
            # Obtener estadísticas de uso
            cursor.execute("""
                SELECT endpoint, COUNT(*) as count, AVG(response_time_ms) as avg_time
                FROM api_usage
                WHERE key_id = ?
                GROUP BY endpoint
            """, (key_id,))
            
            endpoint_stats = []
            for row in cursor.fetchall():
                endpoint_stats.append({
                    'endpoint': row[0],
                    'count': row[1],
                    'avg_response_time_ms': row[2]
                })
            
            return {
                'name': name,
                'created_at': created_at,
                'last_used': last_used,
                'total_requests': usage_count,
                'endpoint_stats': endpoint_stats
            }
        
        finally:
            conn.close()
    
    def log_api_usage(
        self,
        api_key: str,
        endpoint: str,
        method: str,
        status_code: int,
        response_time_ms: int
    ):
        """
        Registra el uso de una API key
        
        Args:
            api_key: API key usada
            endpoint: Endpoint accedido
            method: Método HTTP
            status_code: Código de respuesta
            response_time_ms: Tiempo de respuesta en ms
        """
        key_hash = self._hash_key(api_key)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Obtener ID de la key
            cursor.execute("SELECT id FROM api_keys WHERE key_hash = ?", (key_hash,))
            result = cursor.fetchone()
            
            if result:
                key_id = result[0]
                cursor.execute("""
                    INSERT INTO api_usage 
                    (key_id, endpoint, method, status_code, response_time_ms)
                    VALUES (?, ?, ?, ?, ?)
                """, (key_id, endpoint, method, status_code, response_time_ms))
                
                conn.commit()
        
        finally:
            conn.close()
    
    def create_user(
        self,
        username: str,
        password: str,
        email: str = "",
        is_admin: bool = False
    ) -> bool:
        """
        Crea un nuevo usuario
        
        Args:
            username: Nombre de usuario
            password: Contraseña
            email: Email (opcional)
            is_admin: Si es administrador
            
        Returns:
            True si se creó exitosamente
        """
        password_hash = self._hash_password(password)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO users (username, password_hash, email, is_admin)
                VALUES (?, ?, ?, ?)
            """, (username, password_hash, email, is_admin))
            
            conn.commit()
            return True
        
        except sqlite3.IntegrityError:
            return False
        
        finally:
            conn.close()
    
    def verify_user(self, username: str, password: str) -> Tuple[bool, Optional[Dict]]:
        """
        Verifica credenciales de usuario
        
        Args:
            username: Nombre de usuario
            password: Contraseña
            
        Returns:
            Tupla (es_válido, datos_del_usuario)
        """
        password_hash = self._hash_password(password)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, username, email, is_admin, is_active
                FROM users
                WHERE username = ? AND password_hash = ?
            """, (username, password_hash))
            
            result = cursor.fetchone()
            
            if not result:
                return False, None
            
            user_id, username, email, is_admin, is_active = result
            
            if not is_active:
                return False, None
            
            return True, {
                'id': user_id,
                'username': username,
                'email': email,
                'is_admin': bool(is_admin)
            }
        
        finally:
            conn.close()


# ─── Ejemplo de uso ───────────────────────────────────────────────────────────

def main():
    """Ejemplo de uso del AuthManager"""
    
    print("╔════════════════════════════════════════════════════════════╗")
    print("║         OpenCode Auth Manager - Ejemplo de Uso            ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    
    # Inicializar
    auth = AuthManager()
    
    # Crear usuario
    print("1️⃣  Creando usuario...")
    auth.create_user("admin", "password123", "admin@example.com", is_admin=True)
    print("✅ Usuario creado")
    print()
    
    # Verificar usuario
    print("2️⃣  Verificando usuario...")
    is_valid, user = auth.verify_user("admin", "password123")
    if is_valid:
        print(f"✅ Usuario válido: {user}")
    else:
        print("❌ Usuario inválido")
    print()
    
    # Generar API key
    print("3️⃣  Generando API key...")
    api_key, key_prefix = auth.generate_api_key(
        name="Mi Primera Key",
        owner="admin",
        description="Key para desarrollo",
        expires_in_days=30,
        rate_limit=100
    )
    print(f"✅ API key generada: {key_prefix}")
    print(f"   Clave completa (guardar en lugar seguro): {api_key}")
    print()
    
    # Validar API key
    print("4️⃣  Validando API key...")
    is_valid, key_data = auth.validate_api_key(api_key)
    if is_valid:
        print(f"✅ API key válida: {key_data}")
    else:
        print("❌ API key inválida")
    print()
    
    # Listar API keys
    print("5️⃣  Listando API keys del usuario...")
    keys = auth.list_api_keys("admin")
    for key in keys:
        print(f"  - {key['name']} ({key['key_prefix']})")
        print(f"    Creada: {key['created_at']}")
        print(f"    Activa: {key['is_active']}")
        print(f"    Usos: {key['usage_count']}")
    print()
    
    # Registrar uso
    print("6️⃣  Registrando uso de API key...")
    auth.log_api_usage(api_key, "/api/chat", "POST", 200, 1250)
    print("✅ Uso registrado")
    print()
    
    # Obtener estadísticas
    print("7️⃣  Obteniendo estadísticas...")
    stats = auth.get_api_key_stats(api_key)
    if stats:
        print(f"✅ Estadísticas:")
        print(f"   Nombre: {stats['name']}")
        print(f"   Total de requests: {stats['total_requests']}")
        print(f"   Endpoints usados: {len(stats['endpoint_stats'])}")
        for endpoint in stats['endpoint_stats']:
            print(f"     - {endpoint['endpoint']}: {endpoint['count']} requests")
    print()
    
    print("╔════════════════════════════════════════════════════════════╗")
    print("║                  ✅ Ejemplo completado                    ║")
    print("╚════════════════════════════════════════════════════════════╝")


if __name__ == "__main__":
    main()
