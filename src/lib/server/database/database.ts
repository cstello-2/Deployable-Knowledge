import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export const databaseClient = createClient({
	url: 'file:app.db',
	authToken: process.env.DATABASE_AUTH_TOKEN
});

/**
 * Puts the database in WAL mode, which is recorded in the file itself and so
 * survives the client reopening its connection. Without it a rollback journal
 * blocks every reader for the length of each write, and a folder sync writing a
 * few thousand documents keeps the library list and search waiting behind it.
 */
export async function configureDatabase(): Promise<void> {
	await databaseClient.execute('PRAGMA journal_mode = WAL');
}

export const db = drizzle({ client: databaseClient, schema });
export type Database = typeof db;
export { schema };
