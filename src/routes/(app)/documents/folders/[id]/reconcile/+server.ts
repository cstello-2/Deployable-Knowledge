import { error, json } from '@sveltejs/kit';
import type {
	ApiDocumentFolderReconcileRequest,
	ApiDocumentFolderReconcileResponse,
	ApiSyncFileStat
} from '$lib/types';
import { isSyncableFile } from '$lib/server/documents/source-types';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const folder = await SyncedFoldersRepository.find(params.id);
	if (!folder) throw error(404, 'Synced folder not found.');

	let body: ApiDocumentFolderReconcileRequest;
	try {
		body = (await request.json()) as ApiDocumentFolderReconcileRequest;
	} catch {
		throw error(400, 'Provide a file listing.');
	}
	if (!Array.isArray(body.files)) throw error(400, 'Provide a file listing.');

	const [tracked, failures] = await Promise.all([
		SyncedFoldersRepository.syncedFiles(folder.id),
		SyncedFoldersRepository.failedFiles(folder.id)
	]);
	const trackedByPath = new Map(tracked.map((file) => [file.relativePath, file]));
	const failedPaths = new Set(failures.map((failure) => failure.relativePath));
	const clientPaths = new Set<string>();

	const upload: ApiSyncFileStat[] = [];
	let unchanged = 0;
	let failed = 0;

	for (const file of body.files) {
		if (
			typeof file?.path !== 'string' ||
			typeof file.lastModified !== 'number' ||
			typeof file.size !== 'number'
		) {
			throw error(400, 'Invalid file entry in listing.');
		}
		clientPaths.add(file.path);
		if (!isSyncableFile(file.path)) continue;

		if (failedPaths.has(file.path)) {
			failed += 1;
			continue;
		}

		const row = trackedByPath.get(file.path);
		if (row?.ignored) continue;
		if (row?.documentId && row.lastModified === file.lastModified && row.size === file.size) {
			unchanged += 1;
			continue;
		}
		upload.push({ path: file.path, lastModified: file.lastModified, size: file.size });
	}

	const stale = tracked
		.filter((file) => !clientPaths.has(file.relativePath))
		.map((file) => ({
			path: file.relativePath,
			lastModified: file.lastModified,
			size: file.size
		}));

	return json({ upload, stale, unchanged, failed } satisfies ApiDocumentFolderReconcileResponse);
};
