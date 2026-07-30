import { error, json } from '@sveltejs/kit';
import type { ApiNotebookCollectionImportRequest } from '$lib/types';
import {
	loadNotebookCollection,
	NotebookCollectionImportError
} from '$lib/server/notebooks/import-notebook-collection';
import {
	loadNotebookState,
	NotebooksRepository
} from '$lib/server/repositories/notebooks.repository';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request
		.json()
		.catch(() => null)) as ApiNotebookCollectionImportRequest | null;

	if (typeof body?.path !== 'string' || !body.path.trim()) {
		throw error(400, 'Select a folder');
	}

	try {
		const collection = await loadNotebookCollection(body.path);
		await NotebooksRepository.createWithPages(collection.title, collection.pages);
		return json(await loadNotebookState(), { status: 201 });
	} catch (cause) {
		if (cause instanceof NotebookCollectionImportError) {
			throw error(cause.status, cause.message);
		}

		throw cause;
	}
};
