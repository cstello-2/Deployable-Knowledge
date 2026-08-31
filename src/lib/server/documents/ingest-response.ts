import type {
	ApiDocumentIngestEvent,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult
} from '$lib/types';

export type IngestTask = (
	onProgress: (progress: ApiDocumentIngestProgress) => void
) => Promise<ApiDocumentIngestResult>;

export function ingestStreamResponse(ingest: IngestTask, label = 'Ingesting file'): Response {
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
					send({ status: 'progress', percent: 0, label, message: 'Preparing file' });
					const result = await ingest((progress) => send({ status: 'progress', ...progress }));

					send({ status: 'progress', percent: 100, label, message: 'Complete' });
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
}
