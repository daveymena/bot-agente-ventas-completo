import { Router, type IRouter } from "express";
import { architectTools } from "../lib/architect-tools";
import { codeOperator } from "../lib/code-operator";
import { db, products, agents, settings, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";

const router: IRouter = Router();

// SQL crudo, lectura/escritura de archivos y datos de TODOS los tenants —
// solo el superadmin de la plataforma puede llegar a estas rutas.
router.use(requireSuperAdmin);

router.get("/products", async (_req, res, next) => {
  try {
    const all = await db.select().from(products).limit(100);
    return res.json({ ok: true, total: all.length, products: all });
  } catch (e) {
    return next(e);
  }
});

router.get("/products/:id", async (req, res, next) => {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, Number(req.params.id))).limit(1);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json({ ok: true, product });
  } catch (e) {
    return next(e);
  }
});

router.patch("/products/:id", async (req, res, next) => {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, Number(req.params.id))).limit(1);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });

    const allowed = ["name", "description", "price", "currency", "category", "features", "imageUrl", "highlights", "isActive"];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

    await db.update(products).set(updates).where(eq(products.id, Number(req.params.id)));

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto actualizado: ${product.name}`,
      `Campos modificados: ${Object.keys(updates).join(", ")}`,
      { productId: Number(req.params.id), updates }
    );

    return res.json({ ok: true, message: "Producto actualizado", updates });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-product/:id", async (req, res, next) => {
  try {
    const result = await architectTools.improveProduct(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Producto no encontrado" });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto mejorado: ${result.name}`,
      JSON.stringify(result.changes),
      { productId: Number(req.params.id), changes: result.changes }
    );

    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-description/:id", async (req, res, next) => {
  try {
    const newDesc = await architectTools.improveProductDescription(Number(req.params.id));
    if (!newDesc) return res.status(404).json({ error: "Producto no encontrado" });
    return res.json({ ok: true, description: newDesc });
  } catch (e) {
    return next(e);
  }
});

router.post("/set-image/:id", async (req, res, next) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl es requerido" });

    const ok = await architectTools.setCustomImage(Number(req.params.id), imageUrl);
    if (!ok) return res.status(404).json({ error: "Producto no encontrado" });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Imagen actualizada para producto #${req.params.id}`,
      `Nueva imagen: ${imageUrl.substring(0, 100)}`,
      { productId: Number(req.params.id), imageUrl }
    );

    return res.json({ ok: true, message: "Imagen actualizada" });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-all-products", async (req, res, next) => {
  try {
    const limit = Number(req.body.limit) || 100;
    // `kind` acota a un tipo de producto. El caso que lo motivo: las
    // descripciones de los FISICOS arrastran promesas de producto digital
    // (Drive, descargable, certificado) de la plantilla vieja, y regenerar
    // los 138 del catalogo para arreglar unos pocos es tocar de mas.
    const kind = req.body.kind === "physical" || req.body.kind === "digital" ? req.body.kind : undefined;
    const result = await architectTools.bulkImproveProducts(limit, kind);

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      "Mejora masiva de productos",
      `${result.improved} de ${result.total} productos mejorados`,
      { result }
    );

    return res.json({ ok: true, result });
  } catch (e) {
    return next(e);
  }
});

router.post("/improve-card-layout", async (req, res, next) => {
  try {
    const result = await architectTools.improveCardLayout(req.body.storeId);
    return res.json({ ok: true, message: result });
  } catch (e) {
    return next(e);
  }
});

router.get("/analyze-system", async (req, res, next) => {
  try {
    const analysis = await architectTools.analyzeSystem();

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      "Análisis del sistema",
      JSON.stringify(analysis),
      { analysis }
    );

    return res.json({ ok: true, analysis });
  } catch (e) {
    return next(e);
  }
});

router.post("/products", async (req, res, next) => {
  try {
    const product = await architectTools.createProduct({
      ...req.body,
      tenantId: (req as any).tenant?.id || 1,
    });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto creado: ${product.name}`,
      `Tipo: ${product.kind}`,
      { product }
    );

    return res.status(201).json({ ok: true, product });
  } catch (e) {
    return next(e);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    const ok = await architectTools.deleteProduct(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "Producto no encontrado" });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Producto eliminado: #${req.params.id}`,
      "Producto eliminado del sistema",
      { productId: Number(req.params.id) }
    );

    return res.json({ ok: true, message: "Producto eliminado" });
  } catch (e) {
    return next(e);
  }
});

router.post("/services", async (req, res, next) => {
  try {
    const service = await architectTools.createService({
      ...req.body,
      tenantId: (req as any).tenant?.id || 1,
    });

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Servicio creado: ${service.name}`,
      "Nuevo servicio registrado en el sistema",
      { service }
    );

    return res.status(201).json({ ok: true, service });
  } catch (e) {
    return next(e);
  }
});

router.get("/services", async (_req, res, next) => {
  try {
    const all = await db.select().from(products).where(eq(products.kind, "service")).limit(100);
    return res.json({ ok: true, total: all.length, services: all });
  } catch (e) {
    return next(e);
  }
});

router.post("/query", async (req, res, next) => {
  try {
    const { sql, params } = req.body;
    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ error: "Campo 'sql' requerido" });
    }

    const result = await architectTools.queryDatabase(sql, params);

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      "Consulta a base de datos ejecutada",
      sql.substring(0, 200),
      { sql: sql.substring(0, 200), success: result.success }
    );

    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/execute", async (req, res, next) => {
  try {
    const { action, params: actionParams } = req.body;
    if (!action || typeof action !== "string") {
      return res.status(400).json({ error: "Campo 'action' requerido" });
    }

    let result: any;

    switch (action) {
      case "update-agent-prompt":
        const { agentId, systemPrompt, stages } = actionParams || {};
        if (agentId && systemPrompt) {
          const updateData: any = { systemPrompt };
          if (stages) updateData.stages = stages;
          await db.update(agents as any).set(updateData).where(eq((agents as any).id, agentId));
          result = { success: true, message: "Prompt de agente actualizado" };
        } else {
          result = { success: false, error: "agentId y systemPrompt requeridos" };
        }
        break;

      case "toggle-agent":
        const { agentId: toggleId, isActive } = actionParams || {};
        if (toggleId) {
          await db.update(agents as any).set({ isActive: isActive !== false }).where(eq((agents as any).id, toggleId));
          result = { success: true, message: `Agente ${isActive !== false ? "activado" : "desactivado"}` };
        } else {
          result = { success: false, error: "agentId requerido" };
        }
        break;

      case "update-settings":
        const { settings: settingsUpdate } = actionParams || {};
        if (settingsUpdate && Object.keys(settingsUpdate).length > 0) {
          const [existingSettings] = await db.select().from(settings as any).limit(1);
          if (existingSettings) {
            await db.update(settings as any).set(settingsUpdate).where(eq((settings as any).id, existingSettings.id));
          }
          result = { success: true, message: "Configuración actualizada" };
        } else {
          result = { success: false, error: "No hay configuración para actualizar" };
        }
        break;

      default:
        result = { success: false, error: `Acción desconocida: ${action}` };
    }

    await architectTools.logAction(
      (req as any).tenant?.id || null,
      `Acción ejecutada: ${action}`,
      JSON.stringify(result),
      { action, params: actionParams, result }
    );

    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.get("/system-config", async (_req, res, next) => {
  try {
    const config = await architectTools.getSystemConfig();
    return res.json({ ok: true, config });
  } catch (e) {
    return next(e);
  }
});

router.get("/all-agents", async (_req, res, next) => {
  try {
    const allAgents = await db.select().from(agents as any).limit(50);
    return res.json({ ok: true, total: allAgents.length, agents: allAgents });
  } catch (e) {
    return next(e);
  }
});

router.get("/code/analyze", async (_req, res, next) => {
  try {
    const result = await codeOperator.analyzeProject();
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/code/search", async (req, res, next) => {
  try {
    const { pattern, include } = req.body;
    if (!pattern) return res.status(400).json({ error: "pattern requerido" });
    const result = await codeOperator.searchCode(pattern, include);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/code/read", async (req, res, next) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: "path requerido" });
    const result = codeOperator.readFile(filePath);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/code/write", async (req, res, next) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: "path y content requeridos" });
    const result = codeOperator.writeFile(filePath, content);
    if (result.success) {
      await architectTools.logAction(
        (req as any).tenant?.id || null,
        result.change?.summary || `Archivo modificado: ${filePath}`,
        `Código escrito en ${filePath}`,
        { filePath, changeId: result.change?.id }
      );
    }
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/code/delete", async (req, res, next) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: "path requerido" });
    const result = codeOperator.deleteFile(filePath);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/code/list", async (req, res, next) => {
  try {
    const { path: dirPath } = req.body;
    const result = codeOperator.listDirectory(dirPath || ".");
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.get("/code/changes", async (_req, res, next) => {
  try {
    const limit = Number((_req as any).query.limit) || 20;
    const changes = codeOperator.getChanges(limit);
    return res.json({ ok: true, total: changes.length, changes });
  } catch (e) {
    return next(e);
  }
});

router.post("/code/revert-change", async (req, res, next) => {
  try {
    const { changeId } = req.body;
    if (!changeId) return res.status(400).json({ error: "changeId requerido" });
    const result = codeOperator.revertChange(changeId);
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.get("/frontend/routes", async (_req, res, next) => {
  try {
    const result = await codeOperator.getFrontendRoutes();
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

router.post("/frontend/add-route", async (req, res, next) => {
  try {
    const { path: routePath, componentName, importPath } = req.body;
    if (!routePath || !componentName || !importPath) {
      return res.status(400).json({ error: "path, componentName e importPath requeridos" });
    }

    const appTsxPath = "artifacts/ventas-pro/src/App.tsx";
    const readResult = codeOperator.readFile(appTsxPath);
    if (!readResult.success) return res.status(500).json({ error: readResult.error });

    let content = readResult.content!;
    if (content.includes(importPath)) {
      return res.json({ success: false, error: "Componente ya importado" });
    }

    const importLine = `import ${componentName} from "${importPath}";`;
    const lastImport = content.lastIndexOf("import ");
    const afterLastImport = content.indexOf("\n", lastImport);
    content = content.slice(0, afterLastImport + 1) + importLine + "\n" + content.slice(afterLastImport + 1);

    const routeLine = `<Route path="${routePath}" component={${componentName}} />`;
    const lastRoute = content.lastIndexOf("<Route ");
    const afterLastRoute = content.indexOf("/>", content.indexOf("/>", lastRoute) + 1);
    content = content.slice(0, afterLastRoute + 2) + "\n      " + routeLine + content.slice(afterLastRoute + 2);

    const writeResult = codeOperator.writeFile(appTsxPath, content);
    if (writeResult.success) {
      await architectTools.logAction(
        (req as any).tenant?.id || null,
        `Ruta añadida: ${routePath} → ${componentName}`,
        `Nueva ruta en frontend: ${routePath}`,
        { routePath, componentName }
      );
    }
    return res.json(writeResult);
  } catch (e) {
    return next(e);
  }
});

router.post("/frontend/add-nav-item", async (req, res, next) => {
  try {
    const { label, href, iconName } = req.body;
    if (!label || !href) return res.status(400).json({ error: "label y href requeridos" });

    const layoutPath = "artifacts/ventas-pro/src/components/layout.tsx";
    const readResult = codeOperator.readFile(layoutPath);
    if (!readResult.success) return res.status(500).json({ error: readResult.error });

    let content = readResult.content!;
    const navItemTemplate = `    { label: "${label}", href: "${href}", icon: ${iconName || label} },`;
    const lastNavItem = content.lastIndexOf("{ label:");
    const afterNavItem = content.indexOf("},", lastNavItem);
    content = content.slice(0, afterNavItem + 2) + "\n" + navItemTemplate + content.slice(afterNavItem + 2);

    const writeResult = codeOperator.writeFile(layoutPath, content);
    return res.json(writeResult);
  } catch (e) {
    return next(e);
  }
});

router.post("/update-architect-prompt", async (req, res, next) => {
  try {
    const { newPrompt } = req.body;
    if (!newPrompt) return res.status(400).json({ error: "newPrompt requerido" });

    const agentTemplatesPath = "artifacts/api-server/src/lib/agent-templates.ts";
    const readResult = codeOperator.readFile(agentTemplatesPath);
    if (!readResult.success) return res.status(500).json({ error: readResult.error });

    const content = readResult.content!;
    const architectMatch = content.match(/agentType: "architect",\s*tone: "professional",\s*avatar:.*?systemPrompt: `([\s\S]*?)`,/);
    if (!architectMatch || !architectMatch[1]) {
      return res.status(500).json({ error: "No se pudo encontrar el prompt del arquitecto" });
    }

    const updatedContent = content.replace(architectMatch[1], newPrompt);
    const writeResult = codeOperator.writeFile(agentTemplatesPath, updatedContent);
    return res.json(writeResult);
  } catch (e) {
    return next(e);
  }
});

router.post("/update-system-config", async (req, res, next) => {
  try {
    const { tenantId, settings: settingsUpdate } = req.body;
    const results: any[] = [];

    if (tenantId) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (tenant) {
        const updateData: any = {};
        if (settingsUpdate.brandName) updateData.brandName = settingsUpdate.brandName;
        if (settingsUpdate.plan) updateData.plan = settingsUpdate.plan;
        if (settingsUpdate.status) updateData.status = settingsUpdate.status;
        if (settingsUpdate.agentName) updateData.agentName = settingsUpdate.agentName;
        if (Object.keys(updateData).length > 0) {
          await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId));
          results.push({ table: "tenants", updated: Object.keys(updateData) });
        }
      }
    }

    if (settingsUpdate?.appSettings) {
      const [existingSettings] = await db.select().from(settings).limit(1);
      if (existingSettings) {
        await db.update(settings).set(settingsUpdate.appSettings).where(eq(settings.id, existingSettings.id));
        results.push({ table: "settings", updated: Object.keys(settingsUpdate.appSettings) });
      }
    }

    return res.json({ ok: true, results });
  } catch (e) {
    return next(e);
  }
});

export default router;
