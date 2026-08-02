#!/usr/bin/env node
/**
 * Script simple para actualizar el schema de tenants
 * Agrega las columnas nuevas directamente a SQLite
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = resolve(__dirname, '../data/tecnovariedades.db');

console.log('\n🔧 Actualizando schema de base de datos SQLite...\n');
console.log(`📁 Base de datos: ${DB_PATH}\n`);

try {
  const SQL = await initSqlJs();
  const buffer = readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // Lista de columnas a agregar
  const columns = [
    { name: 'is_admin', type: 'INTEGER DEFAULT 0 NOT NULL', description: 'Usuario admin de la plataforma' },
    { name: 'facebook_integration', type: 'TEXT', description: 'Configuración de Facebook (JSON)' },
    { name: 'email_config', type: 'TEXT', description: 'Configuración de Email/SMTP (JSON)' },
    { name: 'api_keys', type: 'TEXT', description: 'API Keys personalizadas (JSON)' },
  ];

  let updated = false;

  for (const col of columns) {
    try {
      // Intentar agregar la columna
      db.run(`ALTER TABLE tenants ADD COLUMN ${col.name} ${col.type}`);
      console.log(`✅ Columna agregada: ${col.name} - ${col.description}`);
      updated = true;
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`⚪ Columna ya existe: ${col.name}`);
      } else {
        console.error(`❌ Error en columna ${col.name}:`, err.message);
      }
    }
  }

  // Marcar tenant 1 como admin
  try {
    db.run('UPDATE tenants SET is_admin = 1 WHERE id = 1');
    console.log('\n✅ Tenant 1 marcado como administrador\n');
  } catch (err) {
    console.log('\n⚠️  No se pudo marcar como admin (puede que la columna no exista aún)\n');
  }

  // Verificar el resultado
  try {
    const result = db.exec('SELECT id, email, name, is_admin FROM tenants WHERE id = 1');
    if (result.length > 0 && result[0].values.length > 0) {
      const [id, email, name, isAdmin] = result[0].values[0];
      console.log('📋 Usuario admin configurado:');
      console.log(`   ID: ${id}`);
      console.log(`   Email: ${email}`);
      console.log(`   Nombre: ${name}`);
      console.log(`   isAdmin: ${isAdmin ? 'true' : 'false'}\n`);
    }
  } catch (err) {
    console.log('⚠️  No se pudo verificar el usuario\n');
  }

  // Guardar cambios
  if (updated) {
    const { writeFileSync } = await import('fs');
    const data = db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
    console.log('💾 Cambios guardados en la base de datos\n');
  } else {
    console.log('ℹ️  No hubo cambios que guardar (schema ya estaba actualizado)\n');
  }

  db.close();

  console.log('✨ ¡Actualización completada!\n');
  console.log('Próximos pasos:');
  console.log('1. Reinicia el servidor: pnpm run dev');
  console.log('2. Login con: daveymena16@gmail.com');
  console.log('3. Verifica que eres admin: GET /api/auth/me\n');

} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err);
  process.exit(1);
}
