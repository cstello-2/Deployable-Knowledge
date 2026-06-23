import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const databaseClient = createClient({
  url: "file:app.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle({ client: databaseClient, schema });
export type Database = typeof db;
export { schema };
