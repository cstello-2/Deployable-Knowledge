import { error, json } from '@sveltejs/kit';
import type { ApiDocumentFolderMalformedRequest } from '$lib/types';
import { markMalformed } from '$lib/server/documents/folder-file-sync';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

/**
 * Records a file the browser could not get through the upload endpoint at all —
 * a dropped connection or a rejected request never reaches the ingest path, so
 * without this the file would be walked and retried on every reconnect.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const folder = await SyncedFoldersRepository.find(params.id);
	if (!folder) throw error(404, 'Synced folder not found.');

	let body: ApiDocumentFolderMalformedRequest;
	try {
		body = (await request.json()) as ApiDocumentFolderMalformedRequest;
	} catch {
		throw error(400, 'Provide the file that failed.');
	}
	const relativePath = typeof body.path === 'string' ? body.path.trim() : '';
	if (
		!relativePath ||
		!Number.isFinite(body.lastModified) ||
		!Number.isFinite(body.size) ||
		typeof body.message !== 'string'
	) {
		throw error(400, 'Provide the file that failed.');
	}

	await markMalformed(
		folder.id,
		{ relativePath, lastModified: body.lastModified, size: body.size },
		body.message
	);
	return json({ marked: true });
};
