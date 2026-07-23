import { LOCAL_MODEL_PROVIDER_ID, STORAGE_KEYS } from '$lib/constants';
import type { LocalModelTierId } from '$lib/constants/local-models';
import { LocalModelsService } from '$lib/services';
import type { ApiDocumentIngestProgress, ApiLocalModelsStatus } from '$lib/types';
import { persisted } from './persisted.svelte';
import { settingsStore } from './settings.svelte';

class LocalModelsStore {
	status = $state<ApiLocalModelsStatus | null>(null);
	offerOpen = $state(false);
	selectedTier = $state<LocalModelTierId | null>(null);
	downloadingTier = $state<LocalModelTierId | null>(null);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	error = $state<string | null>(null);

	private dismissed = persisted(STORAGE_KEYS.LOCAL_MODEL_OFFER_DISMISSED, false);

	async refresh(): Promise<void> {
		this.status = await LocalModelsService.getStatus();
	}

	async maybeOffer(): Promise<void> {
		if (this.dismissed.value) return;

		try {
			await this.refresh();
		} catch {
			return;
		}

		if (!this.status || this.status.models.some((model) => model.downloaded)) return;

		this.offerOpen = true;
	}

	skipOffer(): void {
		this.dismissed.value = true;
		this.offerOpen = false;
		this.error = null;
	}

	async download(tier: LocalModelTierId): Promise<void> {
		if (this.downloadingTier) return;

		this.downloadingTier = tier;
		this.error = null;
		this.progress = { percent: 0, label: 'Downloading model', message: 'Starting download.' };

		try {
			const fileName = await LocalModelsService.download(
				tier,
				(progress) => (this.progress = progress)
			);

			this.dismissed.value = true;
			this.offerOpen = false;
			await this.activateModel(fileName);
			await this.refresh();
			await settingsStore.loadProviders();
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Model download failed';
		} finally {
			this.downloadingTier = null;
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
