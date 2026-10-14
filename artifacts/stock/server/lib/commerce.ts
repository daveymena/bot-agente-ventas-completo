/**
 * Créditos, suscripciones, pedidos, licencias y regalías.
 *
 * Reglas (mismas que Adobe Stock, adaptadas):
 *  - Un recurso estándar cuesta créditos o consume la cuota mensual de la suscripción.
 *  - La licencia ampliada SIEMPRE se paga con créditos (la suscripción no la cubre).
 *  - Volver a licenciar un recurso ya licenciado con el mismo tipo no cobra de nuevo.
 *  - La regalía del colaborador se calcula sobre el valor nominal del crédito
 *    y se acredita en el momento de la licencia.
 */
import { config } from "../config";
import { all, get, insert, run, tx, parseJson, nowIso } from "../db/client";
import { badRequest, conflict, notFound, paymentRequired } from "./http";
import { creditsFor, subscriptionCovers, royaltyRate } from "../../shared/pricing";
import type { DbUser } from "./auth";
import type { AssetRow } from "./assets";
import { toSummary, getAssetRow } from "./assets";
import type { LicenseDto, LicenseType, OrderDto, PlanDto, CreditPackDto, SubscriptionState } from "../../shared/types";

/** Formatea centavos en la moneda configurada: 9500000 → "$ 95.000" (COP). */
export function formatMoney(cents: number, currency = config.currency, locale = config.locale) {
  const minor = currency === "COP" || currency === "CLP" ? 0 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: minor, maximumFractionDigits: minor }).format(cents / 100);
}

// ── Catálogo comercial ──────────────────────────────────────────────────────

export async function listPlans(): Promise<PlanDto[]> {
  const rows = await all<any>(`SELECT * FROM plans WHERE active=1 ORDER BY sort_order, id`);
  return rows.map((p) => ({
    id: p.id, slug: p.slug, name: p.name, creditsPerMonth: p.credits_per_month, videosPerMonth: p.videos_per_month,
    priceMonthlyCents: p.price_monthly_cents, priceAnnualMonthlyCents: p.price_annual_monthly_cents,
    features: parseJson<string[]>(p.features, []), badge: p.badge, audience: p.audience,
  }));
}

export async function listPacks(): Promise<CreditPackDto[]> {
  const rows = await all<any>(`SELECT * FROM credit_packs WHERE active=1 ORDER BY sort_order, credits`);
  return rows.map((p) => ({ id: p.id, credits: p.credits, priceCents: p.price_cents, label: p.label }));
}

// ── Créditos ────────────────────────────────────────────────────────────────

export async function grantCredits(userId: number, delta: number, reason: string, ref?: { type: string; id: number }, note?: string) {
  return tx(async (t) => {
    const u = await t.get<{ credits: number }>(`SELECT credits FROM users WHERE id=?`, [userId]);
    if (!u) throw notFound("Usuario no encontrado");
    const after = u.credits + delta;
    if (after < 0) throw paymentRequired("Créditos insuficientes", { needed: -after });
    await t.run(`UPDATE users SET credits=? WHERE id=?`, [after, userId]);
    await t.insert(`INSERT INTO credit_transactions(user_id, delta, balance_after, reason, ref_type, ref_id, note) VALUES (?,?,?,?,?,?,?)`,
      [userId, delta, after, reason, ref?.type ?? null, ref?.id ?? null, note ?? null]);
    return after;
  });
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

function orderDescription(kind: string, ref: any, billing: string | null) {
  if (kind === "pack") return `Paquete de ${ref.credits} créditos`;
  return `Suscripción ${ref.name} (${billing === "annual" ? "anual, pago mensual" : "mensual"})`;
}

export async function createOrder(user: DbUser, input: { kind: "pack" | "subscription"; referenceId: number; billing?: "monthly" | "annual"; provider?: "manual" | "mercadopago" }): Promise<OrderDto> {
  const ref = input.kind === "pack"
    ? await get<any>(`SELECT * FROM credit_packs WHERE id=? AND active=1`, [input.referenceId])
    : await get<any>(`SELECT * FROM plans WHERE id=? AND active=1`, [input.referenceId]);
  if (!ref) throw notFound("El plan o paquete no existe.");
  const billing = input.kind === "subscription" ? (input.billing || "annual") : null;
  const amount = input.kind === "pack" ? ref.price_cents : billing === "annual" ? ref.price_annual_monthly_cents : ref.price_monthly_cents;

  let provider = input.provider || (config.payments.mercadoPagoAccessToken ? "mercadopago" : "manual");
  if (provider === "mercadopago" && !config.payments.mercadoPagoAccessToken) provider = "manual";

  const id = await insert(`INSERT INTO orders(user_id, kind, reference_id, billing, amount_cents, currency, status, provider) VALUES (?,?,?,?,?,?,?,?)`,
    [user.id, input.kind, ref.id, billing, amount, config.currency, "pending", provider]);

  let providerRef: string | null = null; let checkoutUrl: string | undefined;
  if (provider === "mercadopago") {
    try {
      const pref = await createMercadoPagoPreference({ id, amountCents: amount, description: orderDescription(input.kind, ref, billing), email: user.email });
      providerRef = pref.id; checkoutUrl = pref.initPoint;
      await run(`UPDATE orders SET provider_ref=?, payload=? WHERE id=?`, [providerRef, JSON.stringify({ checkoutUrl }), id]);
    } catch (e: any) {
      // Si Mercado Pago falla, el pedido sigue vivo como transferencia manual.
      await run(`UPDATE orders SET provider='manual', payload=? WHERE id=?`, [JSON.stringify({ mpError: String(e?.message || e) }), id]);
      provider = "manual";
    }
  }
  return (await getOrder(id, user.id))!;
}

export async function getOrder(id: number, userId?: number): Promise<OrderDto | undefined> {
  const o = await get<any>(`SELECT * FROM orders WHERE id=?${userId ? " AND user_id=?" : ""}`, userId ? [id, userId] : [id]);
  if (!o) return undefined;
  const ref = o.kind === "pack" ? await get<any>(`SELECT * FROM credit_packs WHERE id=?`, [o.reference_id]) : await get<any>(`SELECT * FROM plans WHERE id=?`, [o.reference_id]);
  const payload = parseJson<any>(o.payload, {});
  const reference = `STOCK-${String(o.id).padStart(6, "0")}`;
  return {
    id: o.id, kind: o.kind, referenceId: o.reference_id, billing: o.billing, amountCents: o.amount_cents, currency: o.currency,
    status: o.status, provider: o.provider, providerRef: o.provider_ref,
    instructions: o.status === "pending" ? {
      bank: config.payments.transfer.bank || undefined, account: config.payments.transfer.account || undefined, holder: config.payments.transfer.holder || undefined,
      reference, checkoutUrl: payload.checkoutUrl,
    } : null,
    createdAt: o.created_at, paidAt: o.paid_at, description: ref ? orderDescription(o.kind, ref, o.billing) : "Pedido",
  };
}

export async function listOrders(userId: number): Promise<OrderDto[]> {
  const rows = await all<{ id: number }>(`SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]);
  const out: OrderDto[] = [];
  for (const r of rows) { const o = await getOrder(r.id, userId); if (o) out.push(o); }
  return out;
}

/** Idempotente: si ya estaba pagado no hace nada. */
export async function markOrderPaid(orderId: number, providerRef?: string | null): Promise<boolean> {
  const o = await get<any>(`SELECT * FROM orders WHERE id=?`, [orderId]);
  if (!o) throw notFound("Pedido no encontrado");
  if (o.status === "paid") return false;
  if (o.kind === "pack") {
    const pack = await get<any>(`SELECT * FROM credit_packs WHERE id=?`, [o.reference_id]);
    await grantCredits(o.user_id, pack?.credits || 0, "pack_purchase", { type: "order", id: o.id }, `Paquete de ${pack?.credits} créditos`);
  } else {
    const plan = await get<any>(`SELECT * FROM plans WHERE id=?`, [o.reference_id]);
    const start = new Date(); const end = new Date(start.getTime() + 30 * 86400e3);
    const sub: SubscriptionState = {
      planId: plan.id, planName: plan.name, status: "active", billing: o.billing || "annual",
      periodStart: start.toISOString(), periodEnd: end.toISOString(), creditsLeft: plan.credits_per_month, videosLeft: plan.videos_per_month,
    };
    await run(`UPDATE users SET subscription=? WHERE id=?`, [JSON.stringify(sub), o.user_id]);
  }
  await run(`UPDATE orders SET status='paid', paid_at=?, provider_ref=coalesce(?, provider_ref) WHERE id=?`, [nowIso(), providerRef ?? null, orderId]);
  return true;
}

export async function cancelOrder(orderId: number, userId: number) {
  const r = await run(`UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'`, [orderId, userId]);
  if (!r.rowsAffected) throw conflict("El pedido no se puede cancelar.");
}

// ── Mercado Pago (opcional) ─────────────────────────────────────────────────

async function createMercadoPagoPreference(o: { id: number; amountCents: number; description: string; email: string }): Promise<{ id: string; initPoint: string }> {
  const body = {
    items: [{ id: `order-${o.id}`, title: o.description, quantity: 1, currency_id: config.currency, unit_price: Math.round(o.amountCents) / 100 }],
    payer: { email: o.email },
    external_reference: String(o.id),
    back_urls: { success: `${config.appUrl}/cuenta/pedidos/${o.id}?estado=aprobado`, failure: `${config.appUrl}/cuenta/pedidos/${o.id}?estado=fallido`, pending: `${config.appUrl}/cuenta/pedidos/${o.id}?estado=pendiente` },
    auto_return: "approved",
    notification_url: `${config.appUrl}/api/billing/webhooks/mercadopago`,
    statement_descriptor: config.brand.name.slice(0, 22),
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.payments.mercadoPagoAccessToken}` }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return { id: j.id, initPoint: j.init_point || j.sandbox_init_point };
}

export async function handleMercadoPagoWebhook(query: any, body: any): Promise<{ handled: boolean; orderId?: number }> {
  const type = body?.type || query?.type || query?.topic;
  const paymentId = body?.data?.id || query?.["data.id"] || query?.id;
  if (type !== "payment" || !paymentId || !config.payments.mercadoPagoAccessToken) return { handled: false };
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${config.payments.mercadoPagoAccessToken}` } });
  if (!r.ok) return { handled: false };
  const p: any = await r.json();
  const orderId = Number(p.external_reference);
  if (!orderId) return { handled: false };
  if (p.status === "approved") { await markOrderPaid(orderId, String(p.id)); return { handled: true, orderId }; }
  if (p.status === "rejected" || p.status === "cancelled") { await run(`UPDATE orders SET status='failed' WHERE id=? AND status='pending'`, [orderId]); }
  return { handled: true, orderId };
}

// ── Licencias ───────────────────────────────────────────────────────────────

function priceInput(a: AssetRow) {
  return { type: a.type, isFree: !!a.is_free, isPremium: !!a.is_premium, resolutionLabel: a.resolution_label, overrideStandard: a.price_credits_standard, overrideExtended: a.price_credits_extended };
}

export interface LicenseQuote { type: LicenseType; credits: number; coveredBySubscription: boolean; canAfford: boolean; alreadyLicensed: boolean; free: boolean }

export async function quoteLicense(user: DbUser | undefined, asset: AssetRow, type: LicenseType): Promise<LicenseQuote> {
  const credits = creditsFor(priceInput(asset), type);
  const sub = user ? activeSubscription(user) : null;
  const cover = subscriptionCovers(priceInput(asset), type);
  const covered = !!sub && !!cover && (cover === "credit" ? sub.creditsLeft > 0 : sub.videosLeft > 0);
  const already = user ? !!(await get(`SELECT 1 FROM licenses WHERE user_id=? AND asset_id=? AND (type=? OR type='extended')`, [user.id, asset.id, type])) : false;
  return { type, credits, coveredBySubscription: covered, canAfford: !!user && (credits === 0 || covered || user.credits >= credits), alreadyLicensed: already, free: credits === 0 };
}

export function activeSubscription(user: DbUser): SubscriptionState | null {
  const sub = parseJson<SubscriptionState | null>(user.subscription, null);
  if (!sub || sub.status !== "active") return null;
  if (new Date(sub.periodEnd).getTime() < Date.now()) return null;
  return sub;
}

export async function licenseAsset(user: DbUser, assetId: number, type: LicenseType): Promise<{ license: LicenseDto; charged: { credits: number; source: "credits" | "subscription" | "free" } }> {
  const asset = await getAssetRow(assetId);
  if (!asset || asset.status !== "approved") throw notFound("El recurso no está disponible.");
  const existing = await get<any>(`SELECT * FROM licenses WHERE user_id=? AND asset_id=? AND (type=? OR type='extended') ORDER BY created_at DESC LIMIT 1`, [user.id, assetId, type]);
  if (existing) return { license: await licenseDto(existing, asset), charged: { credits: 0, source: existing.source } };

  const credits = creditsFor(priceInput(asset), type);
  const sub = activeSubscription(user);
  const cover = subscriptionCovers(priceInput(asset), type);
  let source: "credits" | "subscription" | "free" = "credits";
  if (credits === 0) source = "free";
  else if (sub && cover && (cover === "credit" ? sub.creditsLeft > 0 : sub.videosLeft > 0)) source = "subscription";
  else if (user.credits < credits) throw paymentRequired("No tenés créditos suficientes para esta licencia.", { needed: credits - user.credits, price: credits });

  const valueCents = credits * config.creditValueCents || (source === "subscription" ? config.creditValueCents : 0);
  const rate = royaltyRate(asset.type, config.royalty);
  const royaltyCents = asset.contributor_id ? Math.round(valueCents * rate) : 0;

  const licenseId = await tx(async (t) => {
    if (source === "credits") {
      const u = await t.get<{ credits: number }>(`SELECT credits FROM users WHERE id=?`, [user.id]);
      const after = (u?.credits ?? 0) - credits;
      if (after < 0) throw paymentRequired("No tenés créditos suficientes para esta licencia.", { needed: -after, price: credits });
      await t.run(`UPDATE users SET credits=? WHERE id=?`, [after, user.id]);
      await t.insert(`INSERT INTO credit_transactions(user_id, delta, balance_after, reason, ref_type, ref_id, note) VALUES (?,?,?,?,?,?,?)`,
        [user.id, -credits, after, "license", "asset", asset.id, `Licencia ${type === "extended" ? "ampliada" : "estándar"} · ${asset.title.slice(0, 60)}`]);
    } else if (source === "subscription" && sub) {
      const next = { ...sub };
      if (cover === "credit") next.creditsLeft = Math.max(0, next.creditsLeft - 1); else next.videosLeft = Math.max(0, next.videosLeft - 1);
      await t.run(`UPDATE users SET subscription=? WHERE id=?`, [JSON.stringify(next), user.id]);
    }
    const certificate = `VPS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}${String(user.id).padStart(3, "0")}`;
    const lid = await t.insert(`INSERT INTO licenses(certificate_no, user_id, asset_id, type, credits_spent, source, value_cents) VALUES (?,?,?,?,?,?,?)`,
      [certificate, user.id, asset.id, type, source === "credits" ? credits : 0, source, valueCents]);
    await t.run(`UPDATE assets SET licenses_count = licenses_count + 1, downloads = downloads + 1 WHERE id=?`, [asset.id]);
    await t.insert(`INSERT INTO asset_events(asset_id, user_id, kind, day) VALUES (?,?,?,?)`, [asset.id, user.id, "license", new Date().toISOString().slice(0, 10)]);
    if (royaltyCents > 0 && asset.contributor_id) {
      await t.insert(`INSERT INTO earnings(contributor_id, license_id, asset_id, amount_cents, rate) VALUES (?,?,?,?,?)`, [asset.contributor_id, lid, asset.id, royaltyCents, rate]);
      await t.run(`UPDATE users SET earnings_cents = earnings_cents + ? WHERE id=?`, [royaltyCents, asset.contributor_id]);
    }
    return lid;
  });
  const row = await get<any>(`SELECT * FROM licenses WHERE id=?`, [licenseId]);
  return { license: await licenseDto(row, asset), charged: { credits: source === "credits" ? credits : 0, source } };
}

export async function licenseDto(row: any, asset?: AssetRow): Promise<LicenseDto> {
  const a = asset || (await getAssetRow(row.asset_id));
  return {
    id: row.id, certificateNo: row.certificate_no, type: row.type, creditsSpent: row.credits_spent, source: row.source,
    createdAt: row.created_at, downloadsCount: row.downloads_count, asset: a ? toSummary(a) : (null as any),
  };
}

export async function listLicenses(userId: number): Promise<LicenseDto[]> {
  const rows = await all<any>(`SELECT * FROM licenses WHERE user_id=? ORDER BY created_at DESC LIMIT 500`, [userId]);
  const out: LicenseDto[] = [];
  for (const r of rows) out.push(await licenseDto(r));
  return out;
}

// ── Regalías / pagos a colaboradores ────────────────────────────────────────

export async function requestPayout(user: DbUser, method: string, account: string) {
  if (!method || !account) throw badRequest("Indicá el método y la cuenta de pago.");
  if (user.earnings_cents < config.payoutMinimumCents) throw badRequest(`El mínimo para retirar es ${formatMoney(config.payoutMinimumCents)}.`);
  return tx(async (t) => {
    const u = await t.get<{ earnings_cents: number }>(`SELECT earnings_cents FROM users WHERE id=?`, [user.id]);
    const amount = u?.earnings_cents || 0;
    if (amount < config.payoutMinimumCents) throw badRequest("Saldo insuficiente.");
    const id = await t.insert(`INSERT INTO payouts(contributor_id, amount_cents, method, account) VALUES (?,?,?,?)`, [user.id, amount, method, account]);
    await t.run(`UPDATE users SET earnings_cents = 0 WHERE id=?`, [user.id]);
    await t.run(`UPDATE earnings SET status='paid', payout_id=? WHERE contributor_id=? AND status='available'`, [id, user.id]);
    return id;
  });
}

export async function resolvePayout(payoutId: number, status: "paid" | "rejected", note?: string) {
  const p = await get<any>(`SELECT * FROM payouts WHERE id=?`, [payoutId]);
  if (!p) throw notFound("Pago no encontrado");
  if (p.status !== "requested") throw conflict("Este pago ya fue resuelto.");
  await tx(async (t) => {
    await t.run(`UPDATE payouts SET status=?, note=?, resolved_at=? WHERE id=?`, [status, note ?? null, nowIso(), payoutId]);
    if (status === "rejected") {
      await t.run(`UPDATE users SET earnings_cents = earnings_cents + ? WHERE id=?`, [p.amount_cents, p.contributor_id]);
      await t.run(`UPDATE earnings SET status='available', payout_id=NULL WHERE payout_id=?`, [payoutId]);
    }
  });
}
