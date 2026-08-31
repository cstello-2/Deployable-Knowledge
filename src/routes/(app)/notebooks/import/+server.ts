import { error, json } from '@sveltejs/kit';
import {
	buildNotebookCollection,
	NotebookCollectionImportError,
	type ImportedNotebookFile
} from '$lib/server/notebooks/import-notebook-collection';
import { isNotebookPageImportPath } from '$lib/server/notebooks/import-notebook-page';
import {
	loadNotebookState,
	NotebooksRepository
} from '$lib/server/repositories/notebooks.repository';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
		throw error(400, 'Upload the collection files as multipart form data.');
	}

	const form = await request.formData();
	const title = form.get('title');
	if (typeof title !== 'string' || !title.trim()) throw error(400, 'Provide a collection title.');

	const paths = form.getAll('paths');
	const uploads = form.getAll('files');
	if (!uploads.length || uploads.length !== paths.length) {
		throw error(400, 'Provide matching file paths and contents.');
	}

	const files: ImportedNotebookFile[] = [];
	for (const [index, upload] of uploads.entries()) {
		const sourceName = paths[index];
		if (!(upload instanceof File) || typeof sourceName !== 'string' || !sourceName.trim()) {
			throw error(400, 'Provide matching file paths and contents.');
		}
		if (!isNotebookPageImportPath(sourceName)) continue;
		files.push({ sourceName, data: Buffer.from(await upload.arrayBuffer()) });
	}

	try {
		const collection = buildNotebookCollection(title, files);
		await NotebooksRepository.createWithPages(collection.title, collection.pages);
		return json(await loadNotebookState(), { status: 201 });
	} catch (cause) {
		if (cause instanceof NotebookCollectionImportError) {
			throw error(cause.status, cause.message);
		}

		throw cause;
	}
};
