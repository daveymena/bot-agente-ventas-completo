import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "observation"
  | "instruction"
  | "reflection"
  // Evidencia de que se ejecutó una investigación real (web_search/web_fetch)
  // en la sesión -- usado como gate server-side antes de generar un anuncio,
  // para no depender de que el modelo "decida" investigar por su cuenta.
  | "research_evidence";

export interface ArchitectMemory {
  id: number;
  tenantId: number | null;
  sessionId: string;
  memoryType: MemoryType;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertArchitectMemory {
  tenantId?: number | null;
  sessionId: string;
  memoryType: MemoryType;
  title: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, any> | null;
}

export const architectMemory = pgTable("architect_memory", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),
  sessionId: text("session_id").notNull().default("default"),
  memoryType: text("memory_type").$type<MemoryType>().notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, any> | null>().default(null),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
