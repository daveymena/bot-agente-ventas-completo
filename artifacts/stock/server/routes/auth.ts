import { Router } from "express";
import { z } from "zod";
import { all, get, insert, run } from "../db/client";
import { config } from "../config";
import { h, parse, badRequest, conflict, unauthorized } from "../lib/http";
import { createSession, destroySession, findUserByEmail, findUserById, hashPassword, requireUser, toUserDto, verifyPassword, listSessions } from "../lib/auth";
import { grantCredits } from "../lib/commerce";

export const authRouter = Router();

const emailSchema = z.string().email("Correo inválido").max(120);
const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100);

authRouter.post("/register", h(async (req, res) => {
  const body = parse(z.object({ name: z.string().min(2).max(80), email: emailSchema, password: passwordSchema, country: z.string().max(2).optional(), contributor: z.boolean().optional() }), req.body);
  if (await findUserByEmail(body.email)) throw conflict("Ya existe una cuenta con ese correo.");
  const id = await insert(`INSERT INTO users(email, password_hash, name, role, country, contributor_profile) VALUES (?,?,?,?,?,?)`,
    [body.email.trim().toLowerCase(), await hashPassword(body.password), body.name.trim(), body.contributor ? "contributor" : "user", body.country || null,
      body.contributor ? JSON.stringify({ displayName: body.name.trim(), acceptedTermsAt: new Date().toISOString() }) : null]);
  if (config.signupBonusCredits > 0) await grantCredits(id, config.signupBonusCredits, "signup_bonus", undefined, "Créditos de bienvenida");
  await createSession(res, id, req.headers["user-agent"]);
  res.status(201).json(toUserDto((await findUserById(id))!));
}));

authRouter.post("/login", h(async (req, res) => {
  const body = parse(z.object({ email: emailSchema, password: z.string().min(1) }), req.body);
  const u = await findUserByEmail(body.email);
  if (!u || !(await verifyPassword(body.password, u.password_hash))) throw unauthorized("Correo o contraseña incorrectos.");
  if (u.status !== "active") throw unauthorized("Esta cuenta está bloqueada. Escribinos a soporte.");
  await createSession(res, u.id, req.headers["user-agent"]);
  res.json(toUserDto(u));
}));

authRouter.post("/logout", h(async (req, res) => { await destroySession(req, res); res.json({ ok: true }); }));

authRouter.get("/me", h(async (req, res) => {
  if (!req.user) return res.json(null);
  res.json(toUserDto(req.user));
}));

authRouter.patch("/me", requireUser, h(async (req, res) => {
  const body = parse(z.object({ name: z.string().min(2).max(80).optional(), country: z.string().max(2).nullable().optional(), avatarUrl: z.string().url().max(500).nullable().optional() }), req.body);
  await run(`UPDATE users SET name=coalesce(?, name), country=coalesce(?, country), avatar_url=coalesce(?, avatar_url) WHERE id=?`, [body.name?.trim() ?? null, body.country ?? null, body.avatarUrl ?? null, req.user!.id]);
  res.json(toUserDto((await findUserById(req.user!.id))!));
}));

authRouter.post("/password", requireUser, h(async (req, res) => {
  const body = parse(z.object({ current: z.string().min(1), next: passwordSchema }), req.body);
  if (!(await verifyPassword(body.current, req.user!.password_hash))) throw badRequest("La contraseña actual no coincide.");
  await run(`UPDATE users SET password_hash=? WHERE id=?`, [await hashPassword(body.next), req.user!.id]);
  await run(`DELETE FROM sessions WHERE user_id=? AND id != ?`, [req.user!.id, req.sessionId!]);
  res.json({ ok: true });
}));

authRouter.get("/sessions", requireUser, h(async (req, res) => {
  const list = await listSessions(req.user!.id);
  res.json(list.map((s) => ({ current: s.id === req.sessionId, userAgent: s.user_agent, createdAt: s.created_at, expiresAt: s.expires_at })));
}));

authRouter.get("/credits/transactions", requireUser, h(async (req, res) => {
  const rows = await all<any>(`SELECT id, delta, balance_after, reason, ref_type, ref_id, note, created_at FROM credit_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 200`, [req.user!.id]);
  res.json(rows.map((r) => ({ id: r.id, delta: r.delta, balanceAfter: r.balance_after, reason: r.reason, refType: r.ref_type, refId: r.ref_id, note: r.note, createdAt: r.created_at })));
}));

/** Para la pantalla de ayuda: datos de demostración disponibles. */
authRouter.get("/demo-accounts", h(async (_req, res) => {
  if (config.isProd) return res.json([]);
  const rows = await all<any>(`SELECT email, role FROM users WHERE email LIKE '%@stock.local' ORDER BY role`);
  res.json(rows.map((r) => ({ email: r.email, role: r.role, password: r.email === config.admin.email ? config.admin.password : "demo12345" })));
}));

authRouter.get("/exists", h(async (req, res) => {
  const email = String(req.query.email || "");
  if (!email) return res.json({ exists: false });
  res.json({ exists: !!(await get(`SELECT 1 FROM users WHERE lower(email)=lower(?)`, [email])) });
}));
