import { error, json } from '@sveltejs/kit';
import type {
	ApiDocumentFolderRegisterRequest,
	ApiDocumentFolderRegisterResponse,
	ApiDocumentFoldersResponse
} from '$lib/types';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const [rows, malformedCounts] = await Promise.all([
		SyncedFoldersRepository.list(),
		SyncedFoldersRepository.malformedCounts()
	]);
	const folders = rows.map((folder) => ({
		...folder,
		malformedCount: malformedCounts.get(folder.id) ?? 0
	}));
	return json({ folders } satisfies ApiDocumentFoldersResponse);
};

export const POST: RequestHandler = async ({ request }) => {
	let body: ApiDocumentFolderRegisterRequest;
	try {
		body = (await request.json()) as ApiDocumentFolderRegisterRequest;
	} catch {
		throw error(400, 'Provide a folder id and name.');
	}
	const id = typeof body.id === 'string' ? body.id.trim() : '';
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!id || !name) throw error(400, 'Provide a folder id and name.');

	const existing = await SyncedFoldersRepository.find(id);
	await SyncedFoldersRepository.upsert({
		id,
		name,
		createdAt: existing?.createdAt ?? new Date().toISOString()
	});
	const folder = await SyncedFoldersRepository.find(id);
	if (!folder) throw error(500, 'Folder registration failed.');
	return json(
		{ folder: { ...folder, malformedCount: 0 } } satisfies ApiDocumentFolderRegisterResponse,
		{
			status: existing ? 200 : 201
		}
	);
};
