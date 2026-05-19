import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  stage: text("stage"),
  // Metadata estructurada: producto mostrado, intención detectada, proveedor IA, etc.
  metadata: jsonb("metadata").$type<MessageMetadata>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export interface MessageMetadata {
  productId?: number;        // ID del producto mostrado en este mensaje
  productName?: string;      // Nombre del producto (para búsqueda rápida sin JOIN)
  intent?: string;           // Intención detectada: greeting, product, payment, objection, etc.
  cardSent?: boolean;        // Si este mensaje incluía una tarjeta de producto
  aiProvider?: string;       // Proveedor IA que generó la respuesta
  isHardcoded?: boolean;     // Si fue una respuesta hardcodeada (no IA)
  sessionId?: string;        // ID de sesión para agrupar mensajes de una misma sesión
}

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
