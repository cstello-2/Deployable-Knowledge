import type { ServerInit } from '@sveltejs/kit';
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
	await folderWatcherManager.startRegistered();
};
