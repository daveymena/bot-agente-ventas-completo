import { toEmojiStyle } from "../src/lib/conversation-engine";
const before = "🎯 *CURSO DE PIANO COMPLETO*\n\n*Precio:* $60.000 COP\n\n• Acceso de por vida\n• Clases en video\n- Soporte incluido\n━━━━━━━━━━━\n¿Te interesa?";
console.log("ANTES:\n"+before);
console.log("\nDESPUES:\n"+toEmojiStyle(before));
