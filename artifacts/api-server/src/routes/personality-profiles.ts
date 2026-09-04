import { Router, type IRouter } from "express";
import { personalityEngine } from "../lib/personality-engine";
import { db, personalityProfiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Aislamiento entre negocios.
 *
 * Todas estas rutas resolvían el perfil SOLO por su id, y tomaban el tenant
 * del query/body en vez de la sesión: cualquier negocio logueado podía leer,
 * editar o borrar los perfiles de personalidad de OTRO negocio con solo
 * probar ids, y `materialize` caía por defecto al tenant 1. Es el mismo
 * patrón del bug de fb-connect.
 *
 * Un perfil con `tenantId: null` es una plantilla global del sistema: se
 * puede LEER y usar desde cualquier negocio, pero no editar ni borrar.
 */
const tenantDe = (req: any): number | null => req?.tenant?.id ?? null;

/** El negocio de la sesión puede tocar este perfil (no vale el de otro). */
function puedeEditar(profile: { tenantId: number | null }, tenantId: number | null): boolean {
  return tenantId !== null && profile.tenantId === tenantId;
}

/** Además de los propios, deja leer las plantillas globales (tenantId null). */
function puedeLeer(profile: { tenantId: number | null }, tenantId: number | null): boolean {
  return profile.tenantId === null || puedeEditar(profile, tenantId);
}

router.get("/", async (req, res, next) => {
  try {
    // El tenant sale de la sesión, nunca del query -- antes `?tenantId=N`
    // listaba los perfiles de cualquier otro negocio.
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const propios = await personalityEngine.listProfiles(tenantId);
    const globales = (await personalityEngine.listProfiles()).filter(p => p.tenantId === null);
    return res.json({ ok: true, profiles: [...propios, ...globales] });
  } catch (e) {
    return next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const profile = await personalityEngine.getProfile(Number(req.params.id));
    // Mismo 404 si no existe o si es de otro negocio: no confirma su existencia.
    if (!profile || !puedeLeer(profile, tenantId)) return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const profile = await personalityEngine.createProfile({
      name: req.body.name,
      description: req.body.description,
      agentName: req.body.agentName,
      agentRole: req.body.agentRole,
      tone: req.body.tone || "warm_professional",
      language: req.body.language || "es",
      formality: req.body.formality || "tú",
      agentType: req.body.agentType || "general",
      systemPromptCore: req.body.systemPromptCore,
      keywords: req.body.keywords || [],
      brandVoiceOverrides: req.body.brandVoiceOverrides || null,
      // Siempre el de la sesión: aceptar req.body.tenantId dejaba crear
      // perfiles dentro de otro negocio.
      tenantId,
      isActive: req.body.isActive ?? true,
    });
    return res.status(201).json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const existente = await personalityEngine.getProfile(Number(req.params.id));
    if (!existente || !puedeLeer(existente, tenantId)) return res.status(404).json({ error: "Profile not found" });
    if (!puedeEditar(existente, tenantId)) {
      return res.status(403).json({ error: "Las plantillas del sistema no se pueden editar" });
    }
    // tenantId nunca se deja cambiar por body: sería mover el perfil a otro negocio.
    const { tenantId: _ignorado, ...cambios } = req.body || {};
    const profile = await personalityEngine.updateProfile(Number(req.params.id), cambios);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const existente = await personalityEngine.getProfile(Number(req.params.id));
    if (!existente || !puedeLeer(existente, tenantId)) return res.status(404).json({ error: "Profile not found" });
    if (!puedeEditar(existente, tenantId)) {
      return res.status(403).json({ error: "Las plantillas del sistema no se pueden eliminar" });
    }
    const deleted = await personalityEngine.deleteProfile(Number(req.params.id));
    if (!deleted)
      return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, message: "Profile deleted" });
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/materialize", async (req, res, next) => {
  try {
    // Antes: `req.body.tenantId || 1` -- sin sesión creaba el agente dentro
    // del tenant 1 (el dueño de la plataforma), y con body arbitrario dentro
    // de cualquier otro negocio.
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "Sesión requerida" });
    const existente = await personalityEngine.getProfile(Number(req.params.id));
    if (!existente || !puedeLeer(existente, tenantId)) return res.status(404).json({ error: "Profile not found" });
    const agent = await personalityEngine.materializeAgent(
      Number(req.params.id),
      tenantId
    );
    if (!agent)
      return res.status(404).json({ error: "Profile not found" });
    return res.status(201).json({ ok: true, agent, message: "Agent created from personality profile" });
  } catch (e) {
    return next(e);
  }
});

router.post("/generate", async (req, res, next) => {
  try {
    const { description, agentType, tone, language } = req.body;
    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }
    const generated = personalityEngine.generateAgentFromProfile({
      id: 0,
      tenantId: req.body.tenantId || null,
      name: req.body.agentName || "Agente Personalizado",
      description,
      agentName: req.body.agentName || "Agente Personalizado",
      agentRole: req.body.agentRole || "Asesor Virtual",
      tone: tone || "warm_professional",
      language: language || "es",
      formality: req.body.formality || "tú",
      agentType: agentType || "general",
      systemPromptCore: description,
      keywords: req.body.keywords || [],
      brandVoiceOverrides: req.body.brandVoiceOverrides || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    return res.json({ ok: true, generated });
  } catch (e) {
    return next(e);
  }
});

export default router;
