import type { ServerInit } from '@sveltejs/kit';
import { bootstrapSchema } from '$lib/server/database/bootstrap-schema';
import { folderWatcherManager } from '$lib/server/documents/folder-watcher';

const serverLifecycle = globalThis as typeof globalThis & {
	deployableKnowledgeShutdownRegistered?: boolean;
};

function registerShutdown(): void {
	if (serverLifecycle.deployableKnowledgeShutdownRegistered) return;
	serverLifecycle.deployableKnowledgeShutdownRegistered = true;

	const shutdown = async (exitCode: number) => {
		await folderWatcherManager.stopAll();
		process.exit(exitCode);
	};

	process.once('SIGINT', () => void shutdown(130));
	process.once('SIGTERM', () => void shutdown(143));
}

export const init: ServerInit = async () => {
	registerShutdown();
	// The desktop app has no `drizzle-kit` CLI to run `predev`, so it points the
	// server at the migrations it shipped with and lets it catch the database up
	// before anything touches it.
	const migrationsFolder = process.env.DK_MIGRATIONS_DIR?.trim();
	if (migrationsFolder) await bootstrapSchema(migrationsFolder);
	await folderWatcherManager.startRegistered();
};
