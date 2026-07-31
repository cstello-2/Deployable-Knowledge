import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { ApiDocumentFolderRequest, ApiDocumentFoldersResponse } from '$lib/types';
import { streamFolderSync } from '$lib/server/documents/folder-sync-response';
import { folderWatcherManager } from '$lib/server/documents/folder-watcher';
import { containsPath } from '$lib/server/documents/remove-document';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

function pathsOverlap(first: string, second: string): boolean {
	return containsPath(first, second) || containsPath(second, first);
}

export const GET: RequestHandler = async () => {
	const folders = (await SyncedFoldersRepository.list()).map((folder) => ({
		...folder,
		watching: folderWatcherManager.isWatching(folder.id)
	}));
	return json({ folders } satisfies ApiDocumentFoldersResponse);
};

export const POST: RequestHandler = async ({ request }) => {
	let body: ApiDocumentFolderRequest;
	try {
		body = (await request.json()) as ApiDocumentFolderRequest;
	} catch {
		throw error(400, 'Provide a folder path.');
	}
	if (typeof body.path !== 'string' || !body.path.trim())
		throw error(400, 'Provide a folder path.');

	let folderPath: string;
	try {
		folderPath = await realpath(resolve(body.path.trim()));
		const folderStats = await stat(folderPath);
		if (!folderStats.isDirectory()) throw new Error('Path is not a directory.');
		await access(folderPath, constants.R_OK);
	} catch {
		throw error(400, 'Folder does not exist or cannot be read.');
	}

	if (pathsOverlap(folderPath, resolve('documents'))) {
		throw error(400, 'The managed documents directory cannot be watched.');
	}
	if (!containsPath(await realpath(homedir()), folderPath)) {
		throw error(400, 'Select a folder inside your home directory.');
	}

	const existingFolders = await SyncedFoldersRepository.list();
	const existingFolder = existingFolders.find((folder) => folder.path === folderPath);
	if (existingFolder) return streamFolderSync(existingFolder, false);
	if (existingFolders.some((folder) => pathsOverlap(folder.path, folderPath))) {
		throw error(409, 'This folder overlaps an existing synced folder.');
	}

	const folder = { id: randomUUID(), path: folderPath, createdAt: new Date().toISOString() };
	await SyncedFoldersRepository.create(folder);
	return streamFolderSync(folder, true);
};
