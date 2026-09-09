import { Router } from "express";
import { spawn } from "child_process";
import { logger } from "../lib/logger";
import { requireAdmin } from "../lib/tenantManager";

const router = Router();

router.post("/push", requireAdmin(), async (req, res) => {
  try {
    const { message = "Auto-sync from VentasPro Dashboard" } = req.body;
    
    logger.info("[Sync] Iniciando proceso de GIT PUSH...");

    const execute = (cmd: string, args: string[]) => {
      return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn(cmd, args, { shell: false, cwd: process.cwd() });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => stdout += d.toString());
        proc.stderr.on("data", (d) => stderr += d.toString());
        proc.on("close", (code) => resolve({ code: code || 0, stdout, stderr }));
      });
    };

    // 1. Git Add
    await execute("git", ["add", "."]);
    
    // 2. Git Commit
    const commit = await execute("git", ["commit", "-m", String(message).slice(0, 200)]);
    
    // 3. Git Push
    const push = await execute("git", ["push", "origin", "main"]);

    if (push.code === 0) {
      res.json({ 
        success: true, 
        message: "Cambios subidos a GitHub correctamente.",
        details: push.stdout 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: "Error al subir a GitHub.",
        error: push.stderr || commit.stderr 
      });
    }
  } catch (e: any) {
    logger.error(e, "[Sync] Error en Git Push");
    res.status(500).json({ error: "No se pudo completar la sincronización" });
  }
});

router.post("/pull", requireAdmin(), async (req, res) => {
  try {
    logger.info("[Sync] Iniciando proceso de GIT PULL (Update)...");

    const execute = (cmd: string, args: string[]) => {
      return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn(cmd, args, { shell: false, cwd: process.cwd() });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => stdout += d.toString());
        proc.stderr.on("data", (d) => stderr += d.toString());
        proc.on("close", (code) => resolve({ code: code || 0, stdout, stderr }));
      });
    };

    // 1. Git Fetch
    await execute("git", ["fetch", "--all"]);
    
    // 2. Git Reset (to sync exactly with main)
    const pull = await execute("git", ["reset", "--hard", "origin/main"]);

    if (pull.code === 0) {
      res.json({ 
        success: true, 
        message: "Sistema actualizado correctamente desde GitHub.",
        details: pull.stdout 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: "Error al actualizar desde GitHub.",
        error: pull.stderr
      });
    }
  } catch (e: any) {
    logger.error(e, "[Sync] Error en Git Pull");
    res.status(500).json({ error: "No se pudo actualizar la aplicación" });
  }
});

export default router;
