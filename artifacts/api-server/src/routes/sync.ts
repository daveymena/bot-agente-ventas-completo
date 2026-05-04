import { Router } from "express";
import { spawn } from "child_process";
import { logger } from "../lib/logger";

const router = Router();

router.post("/push", async (req, res) => {
  try {
    const { message = "Auto-sync from VentasPro Dashboard" } = req.body;
    
    logger.info("[Sync] Iniciando proceso de GIT PUSH...");

    const execute = (cmd: string, args: string[]) => {
      return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn(cmd, args, { shell: true, cwd: process.cwd() });
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
    const commit = await execute("git", ["commit", "-m", `"${message}"`]);
    
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
    res.status(500).json({ error: e.message });
  }
});

export default router;
