import "dotenv/config";
import { defineConfig } from "prisma/config";

// Optional throw-away shadow DB used by `prisma migrate diff --from-migrations`
// (CI drift check) and `migrate dev`. Only passed when set so local/prod
// behaviour is unchanged. Must point to a different database than DATABASE_URL.
const shadowDatabaseUrl = process.env["SHADOW_DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
