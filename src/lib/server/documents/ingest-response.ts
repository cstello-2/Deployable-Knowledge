import type {
	ApiDocumentIngestEvent,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult
} from '$lib/types';
import { ndjsonTaskResponse } from '$lib/server/utils/ndjson-response';

export type IngestTask = (
	onProgress: (progress: ApiDocumentIngestProgress) => void
) => Promise<ApiDocumentIngestResult>;

export function ingestStreamResponse(ingest: IngestTask, label = 'Ingesting file'): Response {
	return ndjsonTaskResponse<ApiDocumentIngestEvent>(
		'Document ingestion',
		async (send) => {
			send({ status: 'progress', percent: 0, label, message: 'Preparing file' });
			const result = await ingest((progress) => send({ status: 'progress', ...progress }));

			send({ status: 'progress', percent: 100, label, message: 'Complete' });
			send({ status: 'complete', result });
		},
		(cause) => ({
			status: 'error',
			message: cause instanceof Error ? cause.message : 'Document ingestion failed'
		})
	);
}
