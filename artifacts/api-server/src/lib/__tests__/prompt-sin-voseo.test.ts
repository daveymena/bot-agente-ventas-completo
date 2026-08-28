import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * El voseo argentino sobrevivió TRES rondas de QA (M4: ❌ ❌ ❌), con la regla
 * ya escrita en el prompt: "Habla en español COLOMBIANO neutro. Nada de voseo
 * (podés, querés, tenés)".
 *
 * La causa era que el prompt estaba ESCRITO en voseo. Doce renglones debajo de
 * esa regla decía "SÍ podés —y debés— preguntar", y el bloque del catálogo
 * entero iba en "Mandá su ficha", "decíselo", "RAZONÁ", "preguntale",
 * "referite". El modelo copia el registro de lo que lee: le estábamos
 * enseñando exactamente lo que le pedíamos no hacer.
 *
 * Esta prueba lee el archivo y falla si vuelve a entrar voseo en un texto que
 * va al modelo. Es la única forma de que no se cuele de nuevo: una regla
 * escrita no se hace cumplir sola, y ya lo demostró tres veces.
 *
 * Solo mira lo que va DENTRO de `lines.push(\`...\`)`, que es lo que el modelo
 * lee. Los comentarios del código pueden decir lo que quieran.
 */

// El voseo se distingue por la TILDE en la última sílaba: "mandá" es voseo,
// "manda" es el imperativo colombiano correcto; "sabés" es voseo, "sabes" no.
// Por eso el patrón exige la tilde -- sin eso marcaba como error el español
// bien escrito, que fue justo lo que pasó al escribir esta prueba.
//
// Las cuatro sin tilde (decile, preguntale, referite, fijate) son voseo igual:
// en Colombia serían dile, pregúntale, refiérete, fíjate.
const VOSEO = new RegExp(
  [
    // Solo la forma ACENTUADA: "sabes"/"debes" son tuteo correcto y marcarlos
    // como error fue el primer falso positivo de esta prueba.
    "podés", "querés", "tenés", "sabés", "debés", "venís", "hacés", "ponés", "vivís",
    "mand[á]", "dec[í]selo", "decile", "ofrec[é]", "razon[á]", "respond[é]", "contest[á]",
    "preguntale", "pregunt[á]", "toc[á]", "referite", "avanz[á]", "fijate", "aisl[á]",
    "entreg[á]", "escrib[í]", "us[á]", "eleg[í]", "and[á]", "habl[á]", "mostr[á]",
    "dej[á]", "mir[á]", "sos",
    // Los que se colaron en el primer barrido, encontrados por esta prueba.
    "volv[é]", "segu[í]", "sac[á]", "busc[á]", "empez[á]", "termin[á]", "cerr[á]",
    "aprovech[á]", "contale", "mandale", "dejale", "quedate", "acordate", "tom[á]",
    "llev[á]", "prob[á]", "sum[á]", "record[á]", "revis[á]", "confirm[áá]s?", "cont[á]",
    "decí", "respondés", "preguntás", "mandás", "avisás", "mostrás",
    // ⚠️ En un string, "\b" es un RETROCESO, no un límite de palabra: hay que
    // escribir "\\b". Con "\b" el patrón no encuentra nada y la prueba pasa
    // siempre -- pasó al escribirla, y una prueba que no puede fallar es peor
    // que no tenerla.
  ].map((v) => "\\b" + v + "\\b").join("|"),
  "gi",
);

describe("el prompt que lee el modelo está en español colombiano", () => {
  const archivo = path.resolve(__dirname, "..", "conversation-engine.ts");
  const fuente = fs.readFileSync(archivo, "utf-8");

  // Los literales que se empujan al prompt.
  const textos = [...fuente.matchAll(/lines\.push\(\s*`([^`]*)`/gs)].map((m) => m[1]!);

  it("hay textos que revisar (si esto falla, cambió la forma de armar el prompt)", () => {
    expect(textos.length).toBeGreaterThan(50);
  });

  it("ningún texto del prompt usa voseo", () => {
    const culpables: string[] = [];
    for (const t of textos) {
      // Se muestra el ENTORNO del match, no el principio del texto: un push
      // puede tener 300 caracteres y el voseo estar al final, y entonces el
      // error señalaba un fragmento donde no había nada que corregir.
      for (const m of t.matchAll(VOSEO)) {
        const desde = Math.max(0, (m.index ?? 0) - 35);
        culpables.push(`"${m[0]}" → ...${t.slice(desde, (m.index ?? 0) + 45)}...`);
      }
    }
    expect(culpables, culpables.join("\n")).toHaveLength(0);
  });

  it("la regla de hablar colombiano sigue estando", () => {
    // Si alguien la borra, esta prueba avisa: sin la regla, el modelo vuelve
    // a elegir registro por su cuenta.
    expect(fuente).toMatch(/espa[ñn]ol COLOMBIANO/i);
  });
});
