import { LOCAL_MODEL_PROVIDER_ID } from '$lib/constants';
import { LocalModelsService } from '$lib/services';
import type { ApiDocumentIngestProgress, ApiLocalModelsStatus } from '$lib/types';
import { settingsStore } from './settings.svelte';

class LocalModelsStore {
	status = $state<ApiLocalModelsStatus | null>(null);
	downloadingFile = $state<string | null>(null);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	error = $state<string | null>(null);

	async refresh(): Promise<void> {
		this.status = await LocalModelsService.getStatus();
	}

	async download(fileName: string): Promise<void> {
		if (this.downloadingFile) return;

		this.downloadingFile = fileName;
		this.error = null;
		this.progress = { percent: 0, label: 'Downloading model', message: 'Starting download.' };

		try {
			const downloadedFile = await LocalModelsService.download(
				fileName,
				(progress) => (this.progress = progress)
			);

			await this.activateModel(downloadedFile);
			await this.refresh();
			await settingsStore.loadProviders();
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Model download failed';
		} finally {
			this.downloadingFile = null;
			this.progress = null;
		}
	}

	async remove(fileName: string): Promise<void> {
		this.error = null;

		try {
			await LocalModelsService.remove(fileName);
			await this.refresh();
			await settingsStore.loadProviders();
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not delete the model.';
		}
	}

	async activateModel(fileName: string): Promise<void> {
		settingsStore.updateConfig({ provider: LOCAL_MODEL_PROVIDER_ID, model: fileName });

		if (settingsStore.activeProfileId) await settingsStore.saveActive();
		else await settingsStore.createProfile('Local model');
	}
}

export const localModelsStore = new LocalModelsStore();
