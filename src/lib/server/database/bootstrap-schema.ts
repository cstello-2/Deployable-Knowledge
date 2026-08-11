import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './database';

/**
 * Applies any migrations the database has not seen yet.
 *
 * Development syncs the schema with `drizzle-kit push` from `predev`, but the
 * packaged desktop app has no CLI and starts against a fresh per-user database,
 * so it replays the generated migrations in `drizzle/` instead. Drizzle records
 * what it has applied in `__drizzle_migrations`, so a fresh install creates
 * everything and an upgrade runs only the new files.
 */
export function bootstrapSchema(migrationsFolder: string): Promise<void> {
	return migrate(db, { migrationsFolder });
}
