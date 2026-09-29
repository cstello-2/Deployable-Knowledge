import { EmbeddingService, ProvidersService } from '$lib/services';
import type { ApiDocumentIngestProgress, ApiEmbeddingStatus, EmbeddingSettings } from '$lib/types';

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

class EmbeddingStore {
	status = $state<ApiEmbeddingStatus | null>(null);
	remoteModels = $state<string[]>([]);
	saving = $state(false);
	downloadingFile = $state<string | null>(null);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	error = $state<string | null>(null);
	setupOpen = $state(false);

	async init(): Promise<void> {
		await this.refresh();
		if (!this.status || this.status.ready) return;

		this.setupOpen = true;
		await this.retrySetup();
	}

	async retrySetup(): Promise<void> {
		if (this.status) await this.download(this.status.settings.model);
	}

	async refresh(): Promise<void> {
		try {
			this.status = await EmbeddingService.getStatus();
		} catch (error) {
			this.error = errorMessage(error, 'Could not load the embedding settings.');
		}
	}

	async download(fileName: string): Promise<void> {
		if (this.downloadingFile) return;

		this.downloadingFile = fileName;
		this.error = null;
		this.progress = { percent: 0, label: 'Downloading embedding model', message: 'Starting.' };
		try {
			await EmbeddingService.download(fileName, (progress) => (this.progress = progress));
			this.setupOpen = false;
			await this.refresh();
		} catch (error) {
			this.error = errorMessage(error, 'Embedding model download failed.');
		} finally {
			this.downloadingFile = null;
			this.progress = null;
		}
	}

	async remove(fileName: string): Promise<void> {
		this.error = null;
		try {
			await EmbeddingService.remove(fileName);
			await this.refresh();
		} catch (error) {
			this.error = errorMessage(error, 'Could not delete the embedding model.');
		}
	}

	async update(changes: Partial<EmbeddingSettings>): Promise<void> {
		if (!this.status || this.saving) return;

		const current = this.status.settings;
		const next = { ...current, ...changes };
		if (
			next.provider === current.provider &&
			next.model === current.model &&
			next.device === current.device
		) {
			return;
		}

		this.saving = true;
		this.error = null;
		try {
			this.status = await EmbeddingService.update(next);
		} catch (error) {
			this.error = errorMessage(error, 'Could not change the embedding model.');
			return;
		} finally {
			this.saving = false;
		}
		if (!this.status.ready) await this.download(next.model);
	}

	async loadRemoteModels(providerId: string): Promise<void> {
		this.remoteModels = [];
		try {
			this.remoteModels = await ProvidersService.listModels(providerId);
		} catch (error) {
			this.error = errorMessage(error, 'Could not list the provider models.');
		}
	}
}

export const embeddingStore = new EmbeddingStore();
