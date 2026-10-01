import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/store/ai-copy  (OPCIONAL)
 *
 * El copy se genera siempre con las plantillas locales, sin depender de
 * ninguna IA. Esta ruta solo sirve para PULIR ese copy con un LLM si el
 * usuario pega una API key en el panel.
 *
 * Reglas que se le imponen al modelo: español de Colombia, nada de promesas
 * médicas, nada de reseñas inventadas, nada de escasez falsa.
 */

const SYSTEM_PROMPT = `Eres redactor publicitario colombiano especializado en landing pages de respuesta directa para tráfico de Facebook e Instagram Ads en Colombia.

REGLAS OBLIGATORIAS:
1. Escribe en español de Colombia, trato de "tú", natural y directo. Nada de español neutro acartonado ni de "vos".
2. Precios en pesos colombianos con formato $60.000.
3. PROHIBIDO inventar reseñas, testimonios, cifras de clientes o resultados.
4. PROHIBIDO el lenguaje médico no comprobable: "clínicamente probado", "cura", "sana", "elimina el dolor", "aprobado por la FDA". En salud y bienestar habla de comodidad y de uso diario, nunca de curación.
5. PROHIBIDA la escasez falsa: nada de "quedan 17 unidades" ni temporizadores que se reinician.
6. PROHIBIDO usar marcas ajenas en los títulos.
7. Beneficios cortos: de 3 a 6 palabras cada uno.
8. Mantén EXACTAMENTE la misma estructura de claves del JSON que recibes. No agregues ni quites claves.

Devuelve únicamente el JSON, sin explicaciones ni bloques de código.`;

interface AiCopyRequest {
  copy: Record<string, unknown>;
  product: { name: string; description: string; category: string; kind: string; price: number };
  awareness: string;
  angle: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export async function POST(req: Request) {
  let body: AiCopyRequest;
  try {
    body = (await req.json()) as AiCopyRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'El JSON no es válido' }, { status: 400 });
  }

  const apiKey = (body.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'No hay API key. El copy generado con plantillas se mantiene tal cual.' },
      { status: 400 }
    );
  }

  const baseUrl = (body.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const userPrompt = `PRODUCTO
Nombre: ${body.product?.name ?? ''}
Categoría: ${body.product?.category ?? ''}
Tipo: ${body.product?.kind ?? ''}
Precio: $${Number(body.product?.price ?? 0).toLocaleString('es-CO')}
Descripción: ${(body.product?.description ?? '').slice(0, 1200)}

PÚBLICO
Nivel de conciencia: ${body.awareness}
Ángulo de venta: ${body.angle}

COPY ACTUAL (mejóralo manteniendo las mismas claves):
${JSON.stringify(body.copy ?? {}, null, 2)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `El proveedor respondió ${res.status}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? '';
    let copy: Record<string, unknown>;
    try {
      copy = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: 'El modelo no devolvió un JSON válido' }, { status: 502 });
    }

    // Red de seguridad: si aun así cuela una frase prohibida, la limpiamos.
    const BANNED = /cl[ií]nicamente|aprobado por la fda|\bcura\b|quedan \d+ unidades|[uú]ltimas \d+ unidades/i;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(copy)) {
      if (typeof v === 'string' && BANNED.test(v)) {
        clean[k] = (body.copy as Record<string, unknown>)?.[k] ?? v;
      } else {
        clean[k] = v;
      }
    }

    return NextResponse.json({ ok: true, copy: clean, model });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error al consultar el modelo' },
      { status: 502 }
    );
  }
}
