import { SetupService } from '$lib/services';
import type { ApiDocumentIngestProgress } from '$lib/types';

class SetupStore {
	open = $state(false);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	error = $state<string | null>(null);
	installed = $state(false);

	async init(): Promise<void> {
		try {
			const status = await SetupService.getStatus();
			this.installed = status.installed;
			if (!status.installed) await this.install();
		} catch (error) {
			this.showError(error);
		}
	}

	async install(): Promise<void> {
		this.open = true;
		this.error = null;
		this.progress = {
			percent: 0,
			label: 'Preparing semantic search',
			message: 'Downloading the embedding model.'
		};
		try {
			await SetupService.install((progress) => (this.progress = progress));
			this.installed = true;
			this.open = false;
		} catch (error) {
			this.showError(error);
		}
	}

	private showError(error: unknown): void {
		this.open = true;
		this.error = error instanceof Error ? error.message : 'Embedding model setup failed';
	}
}

export const setupStore = new SetupStore();
