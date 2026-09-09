import fs from "fs";
import path from "path";
import { db, architectMemory } from "@workspace/db";
import { logger } from "./logger";

const PROJECT_ROOT = path.resolve(process.cwd());
const BACKUP_ROOT = path.join(PROJECT_ROOT, ".atlas-backups");

interface ChangeRecord {
  id: string;
  type: "file_write" | "file_create" | "file_delete" | "file_rename" | "component_update" | "page_create" | "route_add";
  target: string;
  summary: string;
  diff?: string;
  timestamp: string;
  tenantId?: number;
  appliedBy: string;
  hash: string;
  reverted?: boolean;
}

export class CodeOperator {
  private changes: ChangeRecord[] = [];
  private changeIdCounter = 0;

  private saveSnapshot(changeId: string, target: string, existed: boolean, content: string): void {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(BACKUP_ROOT, `${changeId}.json`),
      JSON.stringify({ target, existed, content }),
      { encoding: "utf-8", mode: 0o600 },
    );
  }

  private loadSnapshot(changeId: string): { target: string; existed: boolean; content: string } | null {
    try {
      const raw = fs.readFileSync(path.join(BACKUP_ROOT, `${changeId}.json`), "utf-8");
      const snapshot = JSON.parse(raw);
      if (typeof snapshot.target !== "string" || typeof snapshot.existed !== "boolean" || typeof snapshot.content !== "string") return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  isPathAllowed(absolutePath: string): { allowed: boolean; reason?: string } {
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(PROJECT_ROOT)) {
      return { allowed: false, reason: "Fuera del directorio del proyecto" };
    }
    const rel = path.relative(PROJECT_ROOT, resolved);
    const blocked = ["node_modules", ".git", ".env", "easypanel.yml"];
    for (const b of blocked) {
      if (rel.startsWith(b) || rel === b) {
        return { allowed: false, reason: `Directorio/archivo bloqueado: ${b}` };
      }
    }
    return { allowed: true };
  }

  readFile(filePath: string): { success: boolean; content?: string; error?: string } {
    try {
      const absPath = path.resolve(PROJECT_ROOT, filePath);
      const check = this.isPathAllowed(absPath);
      if (!check.allowed) return { success: false, error: check.reason };
      if (!fs.existsSync(absPath)) return { success: false, error: "Archivo no encontrado" };
      const content = fs.readFileSync(absPath, "utf-8");
      return { success: true, content };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  writeFile(filePath: string, content: string): { success: boolean; error?: string; change?: ChangeRecord } {
    try {
      const absPath = path.resolve(PROJECT_ROOT, filePath);
      const check = this.isPathAllowed(absPath);
      if (!check.allowed) return { success: false, error: check.reason };

      const exists = fs.existsSync(absPath);
      const oldContent = exists ? fs.readFileSync(absPath, "utf-8") : "";
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const changeId = this.newChangeId();
      this.saveSnapshot(changeId, filePath, exists, oldContent);

      fs.writeFileSync(absPath, content, "utf-8");

      const change = this.recordChange({
        type: exists ? "file_write" : "file_create",
        target: filePath,
        summary: exists ? `Modificado: ${filePath}` : `Creado: ${filePath}`,
        diff: exists ? this.generateDiff(oldContent, content) : undefined,
        appliedBy: "architect-ai",
      }, changeId);

      return { success: true, change };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  deleteFile(filePath: string): { success: boolean; error?: string; change?: ChangeRecord } {
    try {
      const absPath = path.resolve(PROJECT_ROOT, filePath);
      const check = this.isPathAllowed(absPath);
      if (!check.allowed) return { success: false, error: check.reason };
      if (!fs.existsSync(absPath)) return { success: false, error: "Archivo no encontrado" };

      const content = fs.readFileSync(absPath, "utf-8");
      const changeId = this.newChangeId();
      this.saveSnapshot(changeId, filePath, true, content);
      fs.unlinkSync(absPath);

      const change = this.recordChange({
        type: "file_delete",
        target: filePath,
        summary: `Eliminado: ${filePath}`,
        diff: content.substring(0, 500),
        appliedBy: "architect-ai",
      }, changeId);

      return { success: true, change };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  listDirectory(dirPath: string): { success: boolean; entries?: string[]; error?: string } {
    try {
      const absPath = path.resolve(PROJECT_ROOT, dirPath);
      const check = this.isPathAllowed(absPath);
      if (!check.allowed) return { success: false, error: check.reason };
      if (!fs.existsSync(absPath)) return { success: false, error: "Directorio no encontrado" };

      const entries = fs.readdirSync(absPath, { withFileTypes: true }).map(e => {
        const fullPath = path.join(absPath, e.name);
        const relPath = path.relative(PROJECT_ROOT, fullPath);
        return `${e.isDirectory() ? "📁" : "📄"} ${relPath}`;
      });

      return { success: true, entries };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async searchCode(pattern: string, includePattern?: string): Promise<{ success: boolean; results?: { file: string; line: number; content: string }[]; error?: string }> {
    try {
      const results: { file: string; line: number; content: string }[] = [];
      const maxResults = 50;

      const walkDir = (dir: string) => {
        if (results.length >= maxResults) return;
        const blocked = ["node_modules", ".git", ".next", "dist", ".cache"];
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= maxResults) return;
          if (entry.name.startsWith(".")) continue;
          if (blocked.includes(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            if (includePattern && !entry.name.match(new RegExp(includePattern))) continue;
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(pattern)) {
                  const relPath = path.relative(PROJECT_ROOT, fullPath);
                  results.push({ file: relPath, line: i + 1, content: lines[i].trim().substring(0, 150) });
                  if (results.length >= maxResults) return;
                }
              }
            } catch {}
          }
        }
      };

      walkDir(PROJECT_ROOT);
      return { success: true, results };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async analyzeProject(): Promise<{
    success: boolean;
    structure?: {
      backend: { routes: string[]; libs: string[] };
      frontend: { pages: string[]; components: string[] };
      config: string[];
      db: string[];
    };
    error?: string;
  }> {
    try {
      const structure = {
        backend: {
          routes: this.getRelativeFiles("artifacts/api-server/src/routes", ".ts").map(f => f.replace(/\\/g, "/")),
          libs: this.getRelativeFiles("artifacts/api-server/src/lib", ".ts").map(f => f.replace(/\\/g, "/")),
        },
        frontend: {
          pages: this.getRelativeFiles("artifacts/ventas-pro/src/pages", ".tsx").map(f => f.replace(/\\/g, "/")),
          components: this.getRelativeFiles("artifacts/ventas-pro/src/components", ".tsx").map(f => f.replace(/\\/g, "/")),
        },
        config: ["package.json", "Dockerfile", "easypanel.yml", "tsconfig.json", "pnpm-workspace.yaml"].filter(f => fs.existsSync(path.join(PROJECT_ROOT, f))),
        db: this.getRelativeFiles("lib/db/src/schema", ".ts").map(f => f.replace(/\\/g, "/")),
      };
      return { success: true, structure };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getFrontendRoutes(): Promise<{ success: boolean; routes?: { path: string; component: string }[]; error?: string }> {
    try {
      const appTsx = path.join(PROJECT_ROOT, "artifacts", "ventas-pro", "src", "App.tsx");
      if (!fs.existsSync(appTsx)) return { success: false, error: "App.tsx no encontrado" };
      const content = fs.readFileSync(appTsx, "utf-8");

      const routeRegex = /<Route\s+path=["']([^"']+)["'][^>]*component=\{(\w+)\}/g;
      const routes: { path: string; component: string }[] = [];
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        routes.push({ path: match[1], component: match[2] });
      }

      return { success: true, routes };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  getChanges(limit = 20): ChangeRecord[] {
    return this.changes.slice(-limit).reverse();
  }

  revertChange(changeId: string): { success: boolean; error?: string } {
    const change = this.changes.find(c => c.id === changeId);
    if (!change) return { success: false, error: "Cambio no encontrado" };
    if (change.reverted) return { success: false, error: "Cambio ya revertido" };
    const snapshot = this.loadSnapshot(changeId);
    if (!snapshot || snapshot.target !== change.target) {
      return { success: false, error: "No existe un snapshot íntegro para este cambio" };
    }
    try {
      const absPath = path.resolve(PROJECT_ROOT, snapshot.target);
      const check = this.isPathAllowed(absPath);
      if (!check.allowed) return { success: false, error: check.reason };
      if (snapshot.existed) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, snapshot.content, "utf-8");
      } else if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
      change.reverted = true;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: `No se pudo restaurar el archivo: ${e?.message || e}` };
    }
  }

  private getRelativeFiles(dir: string, ext: string): string[] {
    const absDir = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(absDir)) return [];
    const results: string[] = [];
    const walk = (d: string) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(ext)) results.push(path.relative(PROJECT_ROOT, full));
      }
    };
    walk(absDir);
    return results;
  }

  private newChangeId(): string {
    return `chg_${++this.changeIdCounter}_${Date.now()}`;
  }

  private recordChange(data: Omit<ChangeRecord, "id" | "timestamp" | "hash">, reservedId?: string): ChangeRecord {
    const id = reservedId || this.newChangeId();
    const change: ChangeRecord = {
      ...data,
      id,
      timestamp: new Date().toISOString(),
      hash: Buffer.from(`${id}:${data.target}:${Date.now()}`).toString("base64").substring(0, 16),
    } as ChangeRecord;
    this.changes.push(change);

    db.insert(architectMemory).values({
      tenantId: data.tenantId || null,
      sessionId: "code-operator",
      memoryType: "action",
      title: data.summary,
      content: JSON.stringify({ target: data.target, type: data.type }),
      tags: ["code-operator", data.type],
      metadata: { changeId: id, change },
    } as any).catch(() => {});

    return change;
  }

  private generateDiff(oldStr: string, newStr: string): string {
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");
    const diff: string[] = [];
    const maxContext = 3;
    let changes = 0;

    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        changes++;
        if (changes <= 5) {
          if (oldLines[i] !== undefined) diff.push(`- ${oldLines[i]}`);
          if (newLines[i] !== undefined) diff.push(`+ ${newLines[i]}`);
        }
      }
    }

    if (changes > 5) diff.push(`... y ${changes - 5} cambios más`);
    return diff.join("\n");
  }
}

export const codeOperator = new CodeOperator();
