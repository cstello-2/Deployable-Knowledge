import { error, json } from '@sveltejs/kit';
import type { ApiDocumentFolderRetryResponse } from '$lib/types';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const folder = await SyncedFoldersRepository.find(params.id);
	if (!folder) throw error(404, 'Synced folder not found.');

	const cleared = await SyncedFoldersRepository.clearFileFailures(folder.id);
	await SyncedFoldersRepository.setLastError(folder.id, null);
	return json({ cleared } satisfies ApiDocumentFolderRetryResponse);
};
