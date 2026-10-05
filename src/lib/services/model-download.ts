import type {
	ApiDocumentIngestProgress,
	ApiLocalModelDownloadEvent,
	ApiLocalModelDownloadRequest
} from '$lib/types';
import { apiStream, formatBytes, parseNdjsonStream } from '$lib/utils';

export async function streamModelDownload(
	endpoint: string,
	fileName: string,
	label: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void,
	signal?: AbortSignal
): Promise<string> {
	const body: ApiLocalModelDownloadRequest = { fileName };
	const response = await apiStream(endpoint, {
		method: 'POST',
		body: JSON.stringify(body),
		signal
	});

	let downloadedFile: string | null = null;

	for await (const event of parseNdjsonStream<ApiLocalModelDownloadEvent>(response, signal)) {
		if (event.status === 'progress') {
			onProgress?.({
				percent: event.progress * 100,
				label,
				message: `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`
			});
		} else if (event.status === 'ready') {
			downloadedFile = event.fileName;
		} else if (event.status === 'error') {
			throw new Error(event.message);
		}
	}

	if (!downloadedFile) throw new Error('The model download ended unexpectedly.');

	return downloadedFile;
}
