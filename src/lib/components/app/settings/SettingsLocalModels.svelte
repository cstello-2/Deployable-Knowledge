<script lang="ts">
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import { onMount } from 'svelte';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { LOCAL_MODEL_PROVIDER_ID, LOCAL_MODELS, findLocalModelByFile } from '$lib/constants';
	import { localModelsStore, settingsStore } from '$lib/stores';
	import { catalogModelCard, type LocalModelCardData } from './local-model-catalog';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';
	import SettingsModelCard from './SettingsModelCard.svelte';

	let pendingDelete = $state<string | null>(null);

	const cards = $derived.by((): LocalModelCardData[] => {
		const models = localModelsStore.status?.models ?? [];
		const catalogCards = LOCAL_MODELS.map((model) => catalogModelCard(model, model.minRamGiB));
		const customCards = models
			.filter((model) => model.downloaded && !findLocalModelByFile(model.fileName))
			.map((model) => ({
				fileName: model.fileName,
				name: model.fileName,
				vendor: 'Custom model',
				icon: null,
				description: null,
				downloadable: false,
				downloadSizeBytes: null,
				minRamGiB: null,
				license: null,
				licenseUrl: null
			}));
		return [...catalogCards, ...customCards];
	});

	onMount(() => void localModelsStore.refresh().catch(() => {}));
</script>

<SettingsFieldGroup
	icon={HardDrive}
	title="Local models"
	hint="Models run in-app via llama.cpp, fully offline. Download one to get started."
>
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each cards as card (card.fileName)}
			{@const info = localModelsStore.status?.models.find(
				(entry) => entry.fileName === card.fileName
			)}
			<SettingsModelCard
				active={settingsStore.config.provider === LOCAL_MODEL_PROVIDER_ID &&
					settingsStore.config.model === card.fileName}
				downloadDisabled={localModelsStore.downloadingFile !== null}
				downloaded={info?.downloaded ?? false}
				downloading={localModelsStore.downloadingFile === card.fileName}
				model={card}
				onDelete={() => (pendingDelete = card.fileName)}
				onDownload={() => void localModelsStore.download(card.fileName)}
				onUse={() => void localModelsStore.activateModel(card.fileName)}
				percent={localModelsStore.progress?.percent ?? 0}
				sizeOnDiskBytes={info?.sizeBytes ?? null}
			/>
		{/each}
	</div>

	{#if localModelsStore.error}
		<p class="m-0 text-sm text-destructive">{localModelsStore.error}</p>
	{/if}
</SettingsFieldGroup>

<DialogConfirmation
	open={pendingDelete !== null}
	title="Delete local model?"
	description={`This removes ${pendingDelete ?? ''} from disk. You can download it again later.`}
	confirmLabel="Delete"
	onOpenChange={(open) => !open && (pendingDelete = null)}
	onConfirm={async () => {
		if (pendingDelete) await localModelsStore.remove(pendingDelete);
		pendingDelete = null;
	}}
/>
