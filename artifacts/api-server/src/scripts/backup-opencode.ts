import fs from "fs";
import path from "path";
import { db, opencodeConfig, opencodeSkills, opencodeMcpServers, opencodeCommands, opencodeSession } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const OPENCODE_HOME = process.env.OPENCODE_HOME || "/root/.opencode";
const OPENCODE_CONFIG = process.env.OPENCODE_CONFIG || "/root/.config/opencode/opencode.jsonc";
const SKILLS_DIR = path.join(OPENCODE_HOME, "skills");
const MCP_DIR = path.join(OPENCODE_HOME, "mcp");
const COMMAND_DIR = path.join(OPENCODE_HOME, "command");

async function backupConfig() {
  console.log("[Backup] 📦 Respaldando configuración de opencode...");
  if (fs.existsSync(OPENCODE_CONFIG)) {
    const content = fs.readFileSync(OPENCODE_CONFIG, "utf-8");
    const parsed = JSON.parse(content);
    await db.insert(opencodeConfig).values({ key: "opencode.jsonc", value: parsed }).onConflictDoUpdate({ target: opencodeConfig.key, set: { value: parsed, updatedAt: new Date() } });
    console.log("[Backup] ✅ Configuración guardada");
  }
}

async function backupSkills() {
  console.log("[Backup] 📦 Respaldando skills...");
  if (!fs.existsSync(SKILLS_DIR)) return;
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    const content = fs.readFileSync(skillFile, "utf-8");
    const lines = content.split("\n");
    const descLine = lines.find(l => l.startsWith("description: >"));
    const description = descLine ? descLine.replace("description: >", "").trim() : "";
    const files: Record<string, string> = {};
    const allFiles = fs.readdirSync(skillDir);
    for (const f of allFiles) {
      if (f === "SKILL.md") continue;
      const fPath = path.join(skillDir, f);
      if (fs.statSync(fPath).isFile() && fPath.endsWith(".md")) {
        files[f] = fs.readFileSync(fPath, "utf-8");
      }
    }
    await db.insert(opencodeSkills).values({ name: entry.name, description, content, files }).onConflictDoUpdate({ target: opencodeSkills.name, set: { description, content, files, updatedAt: new Date() } });
    console.log(`[Backup] ✅ Skill: ${entry.name}`);
  }
}

async function backupMcpServers() {
  console.log("[Backup] 📦 Respaldando MCP servers...");
  if (!fs.existsSync(MCP_DIR)) return;
  const files = fs.readdirSync(MCP_DIR).filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
  const configPath = OPENCODE_CONFIG;
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const mcpConfigs = config.mcp || {};
    for (const [name, cfg] of Object.entries(mcpConfigs) as [string, any]) {
      await db.insert(opencodeMcpServers).values({
        name,
        type: cfg.type || "local",
        command: cfg.command || [],
        enabled: cfg.enabled !== false ? "true" : "false",
        env: cfg.env || {},
      }).onConflictDoUpdate({ target: opencodeMcpServers.name, set: { type: cfg.type || "local", command: cfg.command || [], enabled: cfg.enabled !== false ? "true" : "false", env: cfg.env || {}, updatedAt: new Date() } });
      console.log(`[Backup] ✅ MCP: ${name}`);
    }
  }
}

async function backupCommands() {
  console.log("[Backup] 📦 Respaldando comandos...");
  const configPath = OPENCODE_CONFIG;
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const cmds = config.command || {};
    for (const [name, cmd] of Object.entries(cmds) as [string, any]) {
      await db.insert(opencodeCommands).values({ name, description: cmd.description || "", template: cmd.template || "" }).onConflictDoUpdate({ target: opencodeCommands.name, set: { description: cmd.description || "", template: cmd.template || "", updatedAt: new Date() } });
      console.log(`[Backup] ✅ Comando: ${name}`);
    }
  }
}

async function backupSessionData(sessionId: string, type: string, data: any) {
  await db.insert(opencodeSession).values({ sessionId, type, data }).onConflictDoUpdate({ target: opencodeSession.sessionId, set: { data, updatedAt: new Date() } });
  console.log(`[Backup] ✅ Sesión: ${sessionId}`);
}

async function main() {
  console.log("🚀 Iniciando backup de opencode a PostgreSQL...");
  try {
    await backupConfig();
    await backupSkills();
    await backupMcpServers();
    await backupCommands();
    console.log("🎉 Backup completado exitosamente");
  } catch (err) {
    console.error("❌ Error en backup:", err);
    process.exit(1);
  }
}

main();
