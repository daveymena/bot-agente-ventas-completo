import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const opencodeConfig = pgTable("opencode_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opencodeSkills = pgTable("opencode_skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  files: jsonb("files").$type<Record<string, string>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opencodeMcpServers = pgTable("opencode_mcp_servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("local"),
  command: jsonb("command").$type<string[]>().notNull(),
  enabled: text("enabled").notNull().default("true"),
  env: jsonb("env").$type<Record<string, string>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opencodeCommands = pgTable("opencode_commands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  template: text("template").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opencodeSession = pgTable("opencode_session", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OpencodeConfig = typeof opencodeConfig.$inferSelect;
export type InsertOpencodeConfig = typeof opencodeConfig.$inferInsert;
export type OpencodeSkill = typeof opencodeSkills.$inferSelect;
export type InsertOpencodeSkill = typeof opencodeSkills.$inferInsert;
export type OpencodeMcpServer = typeof opencodeMcpServers.$inferSelect;
export type InsertOpencodeMcpServer = typeof opencodeMcpServers.$inferInsert;
export type OpencodeCommand = typeof opencodeCommands.$inferSelect;
export type InsertOpencodeCommand = typeof opencodeCommands.$inferInsert;
export type OpencodeSession = typeof opencodeSession.$inferSelect;
export type InsertOpencodeSession = typeof opencodeSession.$inferInsert;
