import type { ApiLocalModelDownloadEvent } from '$lib/types';
import { ndjsonTaskResponse } from './ndjson-response';

const PROGRESS_INTERVAL_MS = 300;

export function modelDownloadResponse(
	name: string,
	fileName: string,
	download: (onProgress: (loaded: number, total: number) => void) => Promise<void>,
	onCancel?: () => void
): Response {
	return ndjsonTaskResponse<ApiLocalModelDownloadEvent>(
		name,
		async (send) => {
			let lastSentAt = 0;
			await download((loaded, total) => {
				const now = Date.now();
				if (!total || (now - lastSentAt < PROGRESS_INTERVAL_MS && loaded < total)) return;
				lastSentAt = now;
				send({ status: 'progress', progress: loaded / total, loaded, total });
			});
			send({ status: 'ready', fileName });
		},
		(cause) => ({
			status: 'error',
			message: cause instanceof Error ? cause.message : `${name} failed`
		}),
		onCancel
	);
}
