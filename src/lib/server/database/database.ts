import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const databaseUrl = process.env.DK_DATABASE_URL?.trim() || 'file:app.db';

export const databaseClient = createClient({
	url: databaseUrl,
	authToken: process.env.DATABASE_AUTH_TOKEN
});

export const db = drizzle({ client: databaseClient, schema });
export type Database = typeof db;
export { schema };
