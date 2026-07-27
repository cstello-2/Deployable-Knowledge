import { API_TRANSCRIPTIONS } from '$lib/constants';
import type { ApiTranscriptionPathRequest, TranscriptionResult } from '$lib/types';
import { apiPost } from '$lib/utils';

export class TranscriptionService {
	static transcribePath(path: string): Promise<TranscriptionResult> {
		return apiPost<TranscriptionResult, ApiTranscriptionPathRequest>(API_TRANSCRIPTIONS.BASE, {
			path
		});
	}
}
