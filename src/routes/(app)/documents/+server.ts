import { error, json } from '@sveltejs/kit';
import { isNotNull } from 'drizzle-orm';
import type {
	ApiDocumentIngestEvent,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult
} from '$lib/types';
import { db } from '$lib/server/database/database';
import { documents, syncedFiles } from '$lib/server/database/schema';
import { folderWatcherManager } from '$lib/server/documents/folder-watcher';
import {
	ingestFileBuffer,
	ingestFilePath,
	ingestTextContent,
	ingestYoutubeUrl
} from '$lib/server/documents/ingest-file';
import { removeDocument } from '$lib/server/documents/remove-document';
import type { RequestHandler } from './$types';

type IngestTask = (
	onProgress: (progress: ApiDocumentIngestProgress) => void
) => Promise<ApiDocumentIngestResult>;

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
			path?: unknown;
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
		} else if (typeof body?.path === 'string' && body.path.trim()) {
			const path = body.path;
			ingest = (onProgress) => ingestFilePath(path, onProgress);
		} else {
			throw error(400, 'Select a file.');
		}
	}

	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (event: ApiDocumentIngestEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					closed = true;
				}
			};

			void (async () => {
				try {
					send({
						status: 'progress',
						percent: 0,
						label: 'Ingesting file',
						message: 'Preparing file'
					});
					const result = await ingest((progress) => send({ status: 'progress', ...progress }));

					send({
						status: 'progress',
						percent: 100,
						label: 'Ingesting file',
						message: 'Complete'
					});
					send({ status: 'complete', result });
				} catch (cause) {
					console.error('Document ingestion failed.');
					send({
						status: 'error',
						message: cause instanceof Error ? cause.message : 'Document ingestion failed'
					});
				} finally {
					if (!closed) {
						try {
							controller.close();
						} catch {
							closed = true;
						}
					}
				}
			})().catch(() => {
				console.error('Document ingestion stream failed.');
			});
		},
		cancel() {
			closed = true;
		}
	});

	return new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'X-Accel-Buffering': 'no'
		}
	});
};

export const DELETE: RequestHandler = async () => {
	const syncedRows = await db
		.select({ folderId: syncedFiles.folderId })
		.from(syncedFiles)
		.where(isNotNull(syncedFiles.documentId));
	for (const folderId of new Set(syncedRows.map((row) => row.folderId))) {
		await folderWatcherManager.waitForIdle(folderId);
	}

	const rows = await db.select({ id: documents.id }).from(documents);
	let removed = 0;
	for (const { id } of rows) {
		if (await removeDocument(id)) removed += 1;
	}

	return json({ removed });
};
