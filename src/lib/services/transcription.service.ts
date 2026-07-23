import { API_TRANSCRIPTIONS } from '$lib/constants';
import type { TranscriptionResult } from '$lib/types';
import { apiFetch } from '$lib/utils';

export class TranscriptionService {
	static transcribe(audio: File): Promise<TranscriptionResult> {
		const body = new FormData();
		body.set('audio', audio);

		return apiFetch<TranscriptionResult>(API_TRANSCRIPTIONS.BASE, {
			body,
			method: 'POST'
		});
	}
}