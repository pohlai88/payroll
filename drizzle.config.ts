import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // A glob rather than a barrel file: the project's standards rule out index
  // files that re-export everything, and drizzle-kit reads the modules directly.
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
