import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: url.includes("sslmode=disable") ? false : undefined,
  },
});
