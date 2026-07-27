import { TranscriptionService } from '$lib/services';
import type { TranscriptionResult } from '$lib/types';

class TranscriptionStore {
	error = $state<string | null>(null);
	loading = $state(false);
	result = $state<TranscriptionResult | null>(null); // In the future, implement transcription history

	async transcribePath(path: string): Promise<void> {
		if (this.loading) return;

		this.error = null;
		this.loading = true;

		try {
			this.result = await TranscriptionService.transcribePath(path);
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Transcription failed.';
			throw error;
		} finally {
			this.loading = false;
		}
	}

	clear(): void {
		this.error = null;
		this.result = null;
	}
}

export const transcriptionStore = new TranscriptionStore();
