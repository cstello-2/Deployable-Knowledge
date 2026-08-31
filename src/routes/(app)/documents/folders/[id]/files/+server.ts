import { error, json } from '@sveltejs/kit';
import type {
	ApiDocumentFolderFileDeleteRequest,
	ApiDocumentFolderFileDeleteResponse
} from '$lib/types';
import { removeSyncedFiles, syncUploadedFile } from '$lib/server/documents/folder-file-sync';
import { ingestStreamResponse } from '$lib/server/documents/ingest-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
		throw error(400, 'Upload a file as multipart form data.');
	}
	const form = await request.formData();
	const upload = form.get('file');
	const relativePath = form.get('path');
	const lastModified = Number(form.get('lastModified'));
	const size = Number(form.get('size'));
	const replacesPathValue = form.get('replacesPath');

	if (!(upload instanceof File)) throw error(400, 'Upload a supported document file.');
	if (typeof relativePath !== 'string' || !relativePath.trim()) {
		throw error(400, 'Provide the file path within the folder.');
	}
	if (!Number.isFinite(lastModified) || !Number.isFinite(size)) {
		throw error(400, 'Provide the file modification time and size.');
	}

	const buffer = Buffer.from(await upload.arrayBuffer());
	const folderId = params.id;
	const file = {
		relativePath: relativePath.trim(),
		lastModified,
		size,
		replacesPath: typeof replacesPathValue === 'string' ? replacesPathValue : undefined
	};

	return ingestStreamResponse((onProgress) => syncUploadedFile(folderId, file, buffer, onProgress));
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	let body: ApiDocumentFolderFileDeleteRequest;
	try {
		body = (await request.json()) as ApiDocumentFolderFileDeleteRequest;
	} catch {
		throw error(400, 'Provide the file paths to remove.');
	}
	if (!Array.isArray(body.paths) || body.paths.some((path) => typeof path !== 'string')) {
		throw error(400, 'Provide the file paths to remove.');
	}

	const result = await removeSyncedFiles(params.id, body.paths);
	return json(result satisfies ApiDocumentFolderFileDeleteResponse);
};
