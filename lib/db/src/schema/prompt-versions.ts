import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { agents } from "./agents";

export interface PromptVersion {
  id: number;
  tenantId: number | null;
  agentId: number | null;
  profileId: number | null;
  previousPrompt: string;
  newPrompt: string;
  diffSummary: string;
  reason: string;
  performanceBefore: Record<string, any> | null;
  performanceAfter: Record<string, any> | null;
  appliedBy: string;
  isActive: boolean;
  createdAt: Date;
}

export interface InsertPromptVersion {
  tenantId?: number | null;
  agentId?: number | null;
  profileId?: number | null;
  previousPrompt: string;
  newPrompt: string;
  diffSummary: string;
  reason: string;
  performanceBefore?: Record<string, any> | null;
  performanceAfter?: Record<string, any> | null;
  appliedBy: string;
  isActive?: boolean;
}

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),
  agentId: integer("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  profileId: integer("profile_id"),
  previousPrompt: text("previous_prompt").notNull(),
  newPrompt: text("new_prompt").notNull(),
  diffSummary: text("diff_summary").notNull(),
  reason: text("reason").notNull(),
  performanceBefore: jsonb("performance_before")
    .$type<Record<string, any> | null>()
    .default(null),
  performanceAfter: jsonb("performance_after")
    .$type<Record<string, any> | null>()
    .default(null),
  appliedBy: text("applied_by").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
