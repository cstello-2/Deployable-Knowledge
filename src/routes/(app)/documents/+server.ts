import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/database/database';
import { documents } from '$lib/server/database/schema';
import {
	ingestFileBuffer,
	ingestTextContent,
	ingestYoutubeUrl
} from '$lib/server/documents/ingest-file';
import { ingestStreamResponse, type IngestTask } from '$lib/server/documents/ingest-response';
import { removeDocument } from '$lib/server/documents/remove-document';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let ingest: IngestTask;
	if (request.headers.get('content-type')?.includes('multipart/form-data')) {
		const upload = (await request.formData()).get('file');
		if (!(upload instanceof File)) throw error(400, 'Upload a supported document file.');
		const name = upload.name || 'document.pdf';
		const buffer = Buffer.from(await upload.arrayBuffer());
		ingest = (onProgress) => ingestFileBuffer(name, buffer, onProgress);
	} else {
		const body = (await request.json().catch(() => null)) as {
			text?: unknown;
			title?: unknown;
			url?: unknown;
		} | null;
		if (typeof body?.url === 'string' && body.url.trim()) {
			const url = body.url;
			ingest = (onProgress) => ingestYoutubeUrl(url, onProgress);
		} else if (typeof body?.text === 'string') {
			const title = typeof body.title === 'string' ? body.title : '';
			if (!title.trim()) throw error(400, 'Give the text a title.');
			if (!body.text.trim()) throw error(400, 'Provide text to embed.');
			const text = body.text;
			ingest = (onProgress) => ingestTextContent(title, text, onProgress);
		} else {
			throw error(400, 'Select a file.');
		}
	}

	return ingestStreamResponse(ingest);
};

export const DELETE: RequestHandler = async () => {
	const rows = await db.select({ id: documents.id }).from(documents);
	let removed = 0;
	for (const { id } of rows) {
		if (await removeDocument(id)) removed += 1;
	}

	return json({ removed });
};
