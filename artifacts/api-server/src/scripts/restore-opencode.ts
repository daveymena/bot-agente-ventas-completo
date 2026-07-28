import fs from "fs";
import path from "path";
import { db, opencodeConfig, opencodeSkills, opencodeMcpServers, opencodeCommands } from "@workspace/db";
import { eq } from "drizzle-orm";

const OPENCODE_HOME = process.env.OPENCODE_HOME || "/root/.opencode";
const OPENCODE_CONFIG_DIR = process.env.OPENCODE_CONFIG || "/root/.config/opencode";
const OPENCODE_CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, "opencode.jsonc");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function restoreConfig() {
  console.log("[Restore] 🔄 Restaurando configuración...");
  const rows = await db.select().from(opencodeConfig).where(eq(opencodeConfig.key, "opencode.jsonc")).limit(1);
  if (rows.length === 0) { console.log("[Restore] ⚠️ No hay configuración guardada"); return; }
  ensureDir(OPENCODE_CONFIG_DIR);
  fs.writeFileSync(OPENCODE_CONFIG_FILE, JSON.stringify(rows[0].value, null, 2), "utf-8");
  console.log("[Restore] ✅ Configuración restaurada");
}

async function restoreSkills() {
  console.log("[Restore] 🔄 Restaurando skills...");
  const skills = await db.select().from(opencodeSkills);
  if (skills.length === 0) { console.log("[Restore] ⚠️ No hay skills guardados"); return; }
  for (const skill of skills) {
    const skillDir = path.join(OPENCODE_HOME, "skills", skill.name);
    ensureDir(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8");
    if (skill.files) {
      for (const [fname, fcontent] of Object.entries(skill.files)) {
        fs.writeFileSync(path.join(skillDir, fname), fcontent, "utf-8");
      }
    }
    console.log(`[Restore] ✅ Skill: ${skill.name}`);
  }
}

async function restoreMcpServers() {
  console.log("[Restore] 🔄 Restaurando MCP servers...");
  const servers = await db.select().from(opencodeMcpServers);
  if (servers.length === 0) { console.log("[Restore] ⚠️ No hay MCPs guardados"); return; }
  let configPath = OPENCODE_CONFIG_FILE;
  if (fs.existsSync(configPath)) {
    let config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!config.mcp) config.mcp = {};
    for (const srv of servers) {
      config.mcp[srv.name] = {
        type: srv.type || "local",
        command: srv.command,
        enabled: srv.enabled === "true",
        env: srv.env || {},
      };
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`[Restore] ✅ MCP: ${srv.name}`);
  } else {
    console.log("[Restore] ⚠️ No se encontró opencode.jsonc para actualizar MCPs");
  }
}

async function restoreCommands() {
  console.log("[Restore] 🔄 Restaurando comandos...");
  const cmds = await db.select().from(opencodeCommands);
  if (cmds.length === 0) { console.log("[Restore] ⚠️ No hay comandos guardados"); return; }
  let configPath = OPENCODE_CONFIG_FILE;
  if (fs.existsSync(configPath)) {
    let config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!config.command) config.command = {};
    for (const cmd of cmds) {
      config.command[cmd.name] = { description: cmd.description, template: cmd.template };
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`[Restore] ✅ Comando: ${cmd.name}`);
  }
}

async function main() {
  console.log("🚀 Iniciando restauración de opencode desde PostgreSQL...");
  try {
    await restoreConfig();
    await restoreSkills();
    await restoreMcpServers();
    await restoreCommands();
    console.log("🎉 Restauración completada exitosamente");
    console.log(`📁 Config: ${OPENCODE_CONFIG_FILE}`);
    console.log(`📁 Skills: ${path.join(OPENCODE_HOME, "skills")}`);
  } catch (err) {
    console.error("❌ Error en restauración:", err);
    process.exit(1);
  }
}

main();
