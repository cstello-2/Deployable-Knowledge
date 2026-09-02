import type { Handle, ServerInit } from '@sveltejs/kit';
import { getThemeSettings } from '$lib/server/database/app-state';
import { bootstrapSchema } from '$lib/server/database/bootstrap-schema';
import { configureDatabase } from '$lib/server/database/database';

// The theme lives in the database, so it cannot be read before paint the way a
// localStorage value can. Stamping it onto <html> during render keeps the boot
// script synchronous and the first paint correctly themed.
export const handle: Handle = async ({ event, resolve }) => {
	const theme = await getThemeSettings();

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%dk.themeColor%', theme.color).replace('%dk.themeMode%', theme.mode)
	});
};

export const init: ServerInit = async () => {
	await configureDatabase();

	// The desktop app has no `drizzle-kit` CLI to run `predev`, so it points the
	// server at the migrations it shipped with and lets it catch the database up
	// before anything touches it.
	const migrationsFolder = process.env.DK_MIGRATIONS_DIR?.trim();
	if (migrationsFolder) await bootstrapSchema(migrationsFolder);
};
