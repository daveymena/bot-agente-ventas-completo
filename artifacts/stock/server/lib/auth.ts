/**
 * Autenticación propia: email + contraseña (bcrypt), sesión opaca en cookie
 * HttpOnly. El token nunca se guarda en claro: la tabla sessions guarda su
 * hash SHA-256, así una copia de la base no sirve para suplantar a nadie.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { all, get, insert, run, parseJson, nowIso } from "../db/client";
import { config } from "../config";
import { forbidden, unauthorized } from "./http";
import type { UserDto, UserRole, SubscriptionState } from "../../shared/types";

export const COOKIE = "stock_session";

export interface DbUser {
  id: number; email: string; password_hash: string | null; name: string; role: UserRole; status: string;
  avatar_url: string | null; country: string | null; credits: number; subscription: string | null;
  contributor_profile: string | null; earnings_cents: number; created_at: string; last_login_at: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: DbUser; sessionId?: string }
  }
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t + config.sessionSecret).digest("hex");

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string | null) { return hash ? bcrypt.compare(pw, hash) : false; }

export async function createSession(res: Response, userId: number, userAgent?: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await insert(`INSERT INTO sessions(id, user_id, user_agent, expires_at) VALUES (?,?,?,?)`, [hashToken(token), userId, userAgent?.slice(0, 200) || null, expires.toISOString()]);
  await run(`UPDATE users SET last_login_at=? WHERE id=?`, [nowIso(), userId]);
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/", expires,
  });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE];
  if (token) await run(`DELETE FROM sessions WHERE id=?`, [hashToken(token)]);
  res.clearCookie(COOKIE, { path: "/" });
}

/** Carga req.user si hay cookie válida; nunca falla. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    const sid = hashToken(token);
    const row = await get<DbUser & { expires_at: string }>(
      `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [sid]);
    if (!row) return next();
    if (new Date(row.expires_at).getTime() < Date.now()) { await run(`DELETE FROM sessions WHERE id=?`, [sid]); return next(); }
    if (row.status !== "active") return next();
    req.user = row; req.sessionId = sid;
    next();
  } catch (e) { next(e); }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "admin") return next();
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export async function findUserByEmail(email: string) {
  return get<DbUser>(`SELECT * FROM users WHERE lower(email)=lower(?)`, [email.trim()]);
}

export async function findUserById(id: number) {
  return get<DbUser>(`SELECT * FROM users WHERE id=?`, [id]);
}

export function toUserDto(u: DbUser): UserDto {
  const sub = parseJson<SubscriptionState | null>(u.subscription, null);
  const cp = parseJson<any>(u.contributor_profile, null);
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatar_url, country: u.country,
    credits: u.credits, subscription: sub && sub.status === "active" && new Date(sub.periodEnd).getTime() > Date.now() ? sub : sub ? { ...sub, status: sub.status === "active" ? "expired" : sub.status } : null,
    contributor: cp ? {
      displayName: cp.displayName || u.name, bio: cp.bio || null, website: cp.website || null,
      payoutMethod: cp.payoutMethod || null, payoutAccount: cp.payoutAccount || null, acceptedTermsAt: cp.acceptedTermsAt,
    } : null,
    earningsCents: u.earnings_cents, createdAt: u.created_at,
  };
}

export async function listSessions(userId: number) {
  return all<{ id: string; user_agent: string | null; created_at: string; expires_at: string }>(
    `SELECT id, user_agent, created_at, expires_at FROM sessions WHERE user_id=? ORDER BY created_at DESC`, [userId]);
}
