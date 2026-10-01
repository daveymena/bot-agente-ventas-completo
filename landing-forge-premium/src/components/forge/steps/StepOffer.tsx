'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Bonus, Bundle, LandingDocument, Offer, Review } from '@/premium/types';
import { cop, discountPercent, prettyPrice, uid } from '@/premium/format';
import { defaultBundles } from '@/premium/defaults';
import { Field, Icon, MoneyInput, Notice, Panel, Select, TextArea, TextInput, Toggle } from '../ui';

export function StepOffer({
  doc,
  setDoc,
}: {
  doc: LandingDocument;
  setDoc: Dispatch<SetStateAction<LandingDocument | null>>;
}) {
  const { offer, socialProof, reviews } = doc.settings;

  const patchOffer = (patch: Partial<Offer>) => {
    setDoc((prev) =>
      prev
        ? {
            ...prev,
            settings: { ...prev.settings, offer: { ...prev.settings.offer, ...patch } },
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
  };

  const setBundles = (bundles: Bundle[]) => patchOffer({ bundles });
  const setBonuses = (bonuses: Bonus[]) => patchOffer({ bonuses });

  const setReviews = (next: Review[]) =>
    setDoc((prev) =>
      prev
        ? { ...prev, settings: { ...prev.settings, reviews: next }, updatedAt: new Date().toISOString() }
        : prev
    );

  const off = discountPercent(offer.price, offer.compareAt);
  const isPhysical = doc.product.kind === 'physical';
  const isDigital = doc.product.kind === 'digital';

  return (
    <div className="space-y-4">
      {/* Precio ------------------------------------------------- */}
      <Panel title="4. Precio" description="Moneda COP. El precio tachado debe ser un precio que realmente hayas tenido.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio de venta">
            <MoneyInput value={offer.price} onChange={(v) => patchOffer({ price: v ?? 0 })} />
          </Field>
          <Field label="Precio tachado" hint={off > 0 ? `${off}% de descuento` : 'Opcional'}>
            <MoneyInput value={offer.compareAt} onChange={(v) => patchOffer({ compareAt: v })} />
          </Field>
        </div>

        {off >= 70 ? (
          <div className="mt-3">
            <Notice tone="warn">
              Un descuento del {off}% se lee como poco creíble y Meta lo marca. Deja el precio
              tachado cerca del precio real anterior.
            </Notice>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {isPhysical ? (
            <>
              <Toggle
                checked={offer.freeShipping}
                onChange={(v) => patchOffer({ freeShipping: v })}
                label="Envío gratis a toda Colombia"
              />
              <Toggle
                checked={offer.cod}
                onChange={(v) => patchOffer({ cod: v })}
                label="Pago contra entrega"
                hint="Se muestra en la barra superior, en el CTA y en el formulario."
              />
              <Toggle
                checked={offer.financing.addi}
                onChange={(v) => patchOffer({ financing: { ...offer.financing, addi: v } })}
                label="Mostrar financiación con Addi"
              />
              <Toggle
                checked={offer.financing.sistecredito}
                onChange={(v) => patchOffer({ financing: { ...offer.financing, sistecredito: v } })}
                label="Mostrar financiación con Sistecrédito"
              />
            </>
          ) : null}

          {isDigital ? (
            <Field
              label="Link de pago (entrega inmediata)"
              hint="Si lo dejas vacío, el botón principal abre WhatsApp con el mensaje prellenado."
            >
              <TextInput
                value={offer.paymentLink ?? ''}
                onChange={(v) => patchOffer({ paymentLink: v || null })}
                placeholder="https://…"
              />
            </Field>
          ) : null}
        </div>
      </Panel>

      {/* Paquetes ------------------------------------------------ */}
      {!isDigital ? (
        <Panel
          title={isPhysical ? 'Paquetes por cantidad' : 'Planes'}
          description={
            isPhysical
              ? 'El del medio va marcado como "Más vendido": es el patrón que más repiten los anuncios que llevan meses activos.'
              : 'Cada plan abre WhatsApp con el mensaje prellenado.'
          }
          action={
            <button
              type="button"
              className="panel-btn-subtle text-[11px]"
              onClick={() => setBundles(defaultBundles(offer.price, doc.product.kind))}
            >
              <Icon name="refresh" size={13} /> Recalcular
            </button>
          }
        >
          <ul className="space-y-2.5">
            {offer.bundles.map((b, i) => (
              <li key={b.id} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
                <div className="mb-2.5 flex items-center gap-2">
                  <input
                    className="panel-input flex-1 py-1.5 text-xs"
                    value={b.label}
                    onChange={(e) => {
                      const next = [...offer.bundles];
                      next[i] = { ...b, label: e.target.value };
                      setBundles(next);
                    }}
                  />
                  <button
                    type="button"
                    title={b.highlight ? 'Quitar destacado' : 'Marcar como más vendido'}
                    className={`panel-btn p-2 ${b.highlight ? 'bg-brand-500 text-white' : 'border border-ink-600 text-ink-400'}`}
                    onClick={() => setBundles(offer.bundles.map((x, j) => ({ ...x, highlight: j === i })))}
                  >
                    <Icon name="star" size={14} />
                  </button>
                  <button
                    type="button"
                    className="panel-btn-subtle p-2 text-ink-400 hover:text-rose-300"
                    onClick={() => setBundles(offer.bundles.filter((_, j) => j !== i))}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Cant.">
                    <input
                      className="panel-input py-1.5 text-xs"
                      type="number"
                      min={1}
                      value={b.qty}
                      onChange={(e) => {
                        const next = [...offer.bundles];
                        next[i] = { ...b, qty: Math.max(1, Number(e.target.value) || 1) };
                        setBundles(next);
                      }}
                    />
                  </Field>
                  <Field label="Precio">
                    <MoneyInput
                      value={b.price}
                      onChange={(v) => {
                        const next = [...offer.bundles];
                        next[i] = { ...b, price: v ?? 0 };
                        setBundles(next);
                      }}
                    />
                  </Field>
                  <Field label="Tachado">
                    <MoneyInput
                      value={b.compareAt ?? null}
                      onChange={(v) => {
                        const next = [...offer.bundles];
                        next[i] = { ...b, compareAt: v };
                        setBundles(next);
                      }}
                    />
                  </Field>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Etiqueta">
                    <input
                      className="panel-input py-1.5 text-xs"
                      value={b.badge ?? ''}
                      placeholder="Más vendido"
                      onChange={(e) => {
                        const next = [...offer.bundles];
                        next[i] = { ...b, badge: e.target.value || null };
                        setBundles(next);
                      }}
                    />
                  </Field>
                  <Field label="Nota">
                    <input
                      className="panel-input py-1.5 text-xs"
                      value={b.note ?? ''}
                      placeholder="El que más piden"
                      onChange={(e) => {
                        const next = [...offer.bundles];
                        next[i] = { ...b, note: e.target.value || null };
                        setBundles(next);
                      }}
                    />
                  </Field>
                </div>
                {b.qty > 1 ? (
                  <p className="mt-2 text-[11px] text-ink-400">
                    {cop(Math.round(b.price / b.qty))} por unidad
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="panel-btn-ghost mt-3 w-full"
            onClick={() => {
              const qty = offer.bundles.length + 1;
              setBundles([
                ...offer.bundles,
                {
                  id: uid('pack'),
                  qty,
                  label: `Pack x${qty}`,
                  price: prettyPrice(offer.price * qty * 0.75),
                  compareAt: offer.price * qty,
                  badge: null,
                  highlight: false,
                  note: null,
                },
              ]);
            }}
          >
            <Icon name="plus" size={15} /> Agregar paquete
          </button>
        </Panel>
      ) : null}

      {/* Bonos --------------------------------------------------- */}
      <Panel title="Bonos" description="Se muestran con el valor tachado. Solo bonos que de verdad entregues.">
        <ul className="space-y-2.5">
          {offer.bonuses.map((b, i) => (
            <li key={b.id} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="panel-input flex-1 py-1.5 text-xs"
                  value={b.title}
                  placeholder="Nombre del bono"
                  onChange={(e) => {
                    const next = [...offer.bonuses];
                    next[i] = { ...b, title: e.target.value };
                    setBonuses(next);
                  }}
                />
                <button
                  type="button"
                  className="panel-btn-subtle p-2 text-ink-400 hover:text-rose-300"
                  onClick={() => setBonuses(offer.bonuses.filter((_, j) => j !== i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <TextArea
                value={b.description}
                rows={2}
                onChange={(v) => {
                  const next = [...offer.bonuses];
                  next[i] = { ...b, description: v };
                  setBonuses(next);
                }}
              />
              <div className="mt-2">
                <Field label="Valor tachado (opcional)">
                  <MoneyInput
                    value={b.value ?? null}
                    onChange={(v) => {
                      const next = [...offer.bonuses];
                      next[i] = { ...b, value: v };
                      setBonuses(next);
                    }}
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="panel-btn-ghost mt-3 w-full"
          onClick={() =>
            setBonuses([...offer.bonuses, { id: uid('bonus'), title: '', description: '', value: null }])
          }
        >
          <Icon name="plus" size={15} /> Agregar bono
        </button>
      </Panel>

      {/* Garantía y plazos --------------------------------------- */}
      <Panel title="Garantía y entrega">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Días de garantía">
            <input
              className="panel-input"
              type="number"
              min={0}
              value={offer.guaranteeDays}
              onChange={(e) => patchOffer({ guaranteeDays: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Evento de conversión">
            <Select
              value={doc.settings.tracking.conversionEvent}
              onChange={(v) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          tracking: { ...prev.settings.tracking, conversionEvent: v },
                        },
                      }
                    : prev
                )
              }
              options={[
                { value: 'Lead', label: 'Lead (recomendado en COD)' },
                { value: 'Purchase', label: 'Purchase' },
              ]}
            />
          </Field>
        </div>

        {!isDigital ? (
          <div className="mt-3">
            <Field label="Tiempo de entrega">
              <TextInput
                value={offer.shippingEta}
                onChange={(v) => patchOffer({ shippingEta: v })}
                placeholder="Entrega de 2 a 5 días hábiles"
              />
            </Field>
          </div>
        ) : null}

        <div className="mt-3">
          <Field
            label="Fin real de la promoción"
            hint="Solo se permite una cuenta regresiva hacia una fecha de verdad. Si la dejas vacía, no se muestra ningún contador."
          >
            <input
              className="panel-input"
              type="datetime-local"
              value={offer.deadline ? toLocalInput(offer.deadline) : ''}
              onChange={(e) =>
                patchOffer({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Política de cambios">
            <TextArea
              value={doc.settings.returnPolicy}
              rows={3}
              onChange={(v) =>
                setDoc((prev) =>
                  prev ? { ...prev, settings: { ...prev.settings, returnPolicy: v } } : prev
                )
              }
            />
          </Field>
        </div>
      </Panel>

      {/* Prueba social ------------------------------------------- */}
      <Panel
        title="Prueba social"
        description="Solo números que puedas sustentar. Si los dejas vacíos, no se muestran."
      >
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Clientes">
            <input
              className="panel-input"
              type="number"
              min={0}
              value={socialProof.customers ?? ''}
              placeholder="2355"
              onChange={(e) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          socialProof: {
                            ...prev.settings.socialProof,
                            customers: e.target.value ? Number(e.target.value) : null,
                          },
                        },
                      }
                    : prev
                )
              }
            />
          </Field>
          <Field label="Calificación">
            <input
              className="panel-input"
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={socialProof.rating ?? ''}
              placeholder="4.8"
              onChange={(e) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          socialProof: {
                            ...prev.settings.socialProof,
                            rating: e.target.value ? Number(e.target.value) : null,
                          },
                        },
                      }
                    : prev
                )
              }
            />
          </Field>
          <Field label="N.º reseñas">
            <input
              className="panel-input"
              type="number"
              min={0}
              value={socialProof.ratingCount ?? ''}
              placeholder="312"
              onChange={(e) =>
                setDoc((prev) =>
                  prev
                    ? {
                        ...prev,
                        settings: {
                          ...prev.settings,
                          socialProof: {
                            ...prev.settings.socialProof,
                            ratingCount: e.target.value ? Number(e.target.value) : null,
                          },
                        },
                      }
                    : prev
                )
              }
            />
          </Field>
        </div>
      </Panel>

      {/* Reseñas reales ------------------------------------------ */}
      <Panel
        title="Reseñas reales"
        description="Se cargan a mano. Si no hay ninguna, la sección no aparece en la landing."
      >
        {reviews.length === 0 ? (
          <Notice tone="warn">
            No hay reseñas cargadas, así que la sección de reseñas está oculta. Nunca generamos
            testimonios automáticos: inventarlos pone en riesgo tu cuenta publicitaria.
          </Notice>
        ) : null}

        <ul className="mt-3 space-y-2.5">
          {reviews.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
              <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className="panel-input py-1.5 text-xs"
                  value={r.name}
                  placeholder="Nombre"
                  onChange={(e) => {
                    const next = [...reviews];
                    next[i] = { ...r, name: e.target.value };
                    setReviews(next);
                  }}
                />
                <input
                  className="panel-input py-1.5 text-xs"
                  value={r.city}
                  placeholder="Ciudad"
                  onChange={(e) => {
                    const next = [...reviews];
                    next[i] = { ...r, city: e.target.value };
                    setReviews(next);
                  }}
                />
                <button
                  type="button"
                  className="panel-btn-subtle p-2 text-ink-400 hover:text-rose-300"
                  onClick={() => setReviews(reviews.filter((_, j) => j !== i))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <TextArea
                value={r.text}
                rows={2}
                placeholder="Lo que escribió el cliente, tal cual."
                onChange={(v) => {
                  const next = [...reviews];
                  next[i] = { ...r, text: v };
                  setReviews(next);
                }}
              />
              <div className="mt-2 flex items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const next = [...reviews];
                        next[i] = { ...r, stars: s as Review['stars'] };
                        setReviews(next);
                      }}
                      className={s <= r.stars ? 'text-amber-400' : 'text-ink-600'}
                      aria-label={`${s} estrellas`}
                    >
                      <Icon name="star" size={16} />
                    </button>
                  ))}
                </div>
                <input
                  className="panel-input flex-1 py-1.5 text-[11px]"
                  value={r.photo ?? ''}
                  placeholder="URL de la foto del cliente (opcional)"
                  onChange={(e) => {
                    const next = [...reviews];
                    next[i] = { ...r, photo: e.target.value || null };
                    setReviews(next);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="panel-btn-ghost mt-3 w-full"
          onClick={() =>
            setReviews([
              ...reviews,
              { id: uid('rev'), name: '', city: '', text: '', stars: 5, photo: null, verified: true },
            ])
          }
        >
          <Icon name="plus" size={15} /> Agregar reseña real
        </button>
      </Panel>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
