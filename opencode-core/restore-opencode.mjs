import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const OPENCODE_HOME = process.env.OPENCODE_HOME || '/root/.opencode';
const OPENCODE_CONFIG_DIR = process.env.OPENCODE_CONFIG || '/root/.config/opencode';
const OPENCODE_CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, 'opencode.jsonc');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function query(pool, text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

async function restoreConfig(pool) {
  console.log('[Restore] Restaurando configuración...');
  const rows = await query(pool, 'SELECT value FROM opencode_config WHERE key = $1', ['opencode.jsonc']);
  if (rows.length === 0) { console.log('[Restore] No hay configuración guardada'); return; }
  ensureDir(OPENCODE_CONFIG_DIR);
  fs.writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(rows[0].value, null, 2), 'utf-8');
  console.log('[Restore] Configuración restaurada');
}

async function restoreSkills(pool) {
  console.log('[Restore] Restaurando skills...');
  const skills = await query(pool, 'SELECT name, description, content, files FROM opencode_skills');
  if (skills.length === 0) { console.log('[Restore] No hay skills guardados'); return; }
  for (const skill of skills) {
    const skillDir = path.join(OPENCODE_HOME, 'skills', skill.name);
    ensureDir(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content, 'utf-8');
    if (skill.files && typeof skill.files === 'object') {
      for (const [fname, fcontent] of Object.entries(skill.files)) {
        fs.writeFileSync(path.join(skillDir, fname), fcontent, 'utf-8');
      }
    }
    console.log(`[Restore] Skill: ${skill.name}`);
  }
}

async function restoreMcpServers(pool) {
  console.log('[Restore] Restaurando MCP servers...');
  const servers = await query(pool, 'SELECT name, type, command, enabled, env FROM opencode_mcp_servers');
  if (servers.length === 0) { console.log('[Restore] No hay MCPs guardados'); return; }
  if (fs.existsSync(OPENCODE_CONFIG_FILE)) {
    let config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_FILE, 'utf-8'));
    if (!config.mcp) config.mcp = {};
    for (const srv of servers) {
      config.mcp[srv.name] = {
        type: srv.type || 'local',
        command: srv.command || [],
        enabled: srv.enabled === 'true',
        env: srv.env || {},
      };
    }
    fs.writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[Restore] MCP: ${srv.name}`);
  }
}

async function restoreCommands(pool) {
  console.log('[Restore] Restaurando comandos...');
  const cmds = await query(pool, 'SELECT name, description, template FROM opencode_commands');
  if (cmds.length === 0) { console.log('[Restore] No hay comandos guardados'); return; }
  if (fs.existsSync(OPENCODE_CONFIG_FILE)) {
    let config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_FILE, 'utf-8'));
    if (!config.command) config.command = {};
    for (const cmd of cmds) {
      config.command[cmd.name] = { description: cmd.description, template: cmd.template };
    }
    fs.writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[Restore] Comando: ${cmd.name}`);
  }
}

async function main() {
  console.log('Restaurando opencode desde PostgreSQL...');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('DATABASE_URL no definida, saltando restauración');
    return;
  }

  let pool;
  try {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    await pool.query('SELECT 1');
    console.log('[Restore] Conectado a PostgreSQL');

    await restoreConfig(pool);
    await restoreSkills(pool);
    await restoreMcpServers(pool);
    await restoreCommands(pool);

    console.log('Restauración completada');
  } catch (err) {
    console.error('Error en restauración:', err.message);
  } finally {
    if (pool) await pool.end();
  }
}

main();
