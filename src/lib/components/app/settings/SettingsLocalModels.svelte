<script lang="ts">
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import { onMount } from 'svelte';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { LOCAL_MODELS, findLocalModelByFile } from '$lib/constants';
	import { localModelsStore } from '$lib/stores';
	import { LOCAL_MODEL_ICONS, type LocalModelCardData } from './local-model-catalog';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';
	import SettingsModelCard from './SettingsModelCard.svelte';

	let pendingDelete = $state<string | null>(null);

	const cards = $derived.by((): LocalModelCardData[] => {
		const models = localModelsStore.status?.models ?? [];
		const catalogCards = LOCAL_MODELS.map((model) => ({
			fileName: model.fileName,
			name: model.name,
			vendor: model.vendor,
			icon: LOCAL_MODEL_ICONS[model.fileName] ?? null,
			description: model.description,
			downloadable: true,
			downloadSizeBytes: model.sizeBytes,
			minRamGiB: model.minRamGiB,
			license: model.license,
			licenseUrl: model.licenseUrl
		}));
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
			<SettingsModelCard model={card} onDelete={(fileName) => (pendingDelete = fileName)} />
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
