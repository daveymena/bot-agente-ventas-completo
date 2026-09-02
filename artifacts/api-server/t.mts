import { isApproval, isRejection } from "./src/lib/architect-store";
const APRUEBAN = [
 "si","sí","dale","ok","listo","confirmo","confirmado","si confirmado","sí, confirmado",
 "dale confirmado","apruebo","adelante","hazlo","va","perfecto","de una","dale pues",
 "sí dale","publicalo","publícalo ya","procede","correcto","está bien","esta bien",
 "me gusta","así está bien","sale","hágale","hagale","listo dale","ok dale","sí señor",
 "dale que sí","confirmado dale","ya está","aprobado","publica","súbelo","subelo",
];
const NO_APRUEBAN = [
 "no","espera","cambia el texto","sí pero cambia el título","mejor otro","cancela",
 "no me gusta","cámbialo","¿cuánto cuesta?","hola",
];
let fallan: string[] = [];
for (const t of APRUEBAN) if (!isApproval(t)) fallan.push("NO detecta: " + JSON.stringify(t));
for (const t of NO_APRUEBAN) if (isApproval(t)) fallan.push("FALSO POSITIVO: " + JSON.stringify(t));
console.log(fallan.length ? fallan.join("\n") : "todas bien");
console.log(`\naprueban ok: ${APRUEBAN.filter(isApproval).length}/${APRUEBAN.length}`);
