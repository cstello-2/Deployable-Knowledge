<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Download from '@lucide/svelte/icons/download';
	import Settings from '@lucide/svelte/icons/settings';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Progress } from '$lib/components/ui/progress';
	import { LOCAL_MODEL_PROVIDER_ID, LOCAL_MODELS, findLocalModelByFile } from '$lib/constants';
	import { localModelsStore, settingsDialogStore, settingsStore } from '$lib/stores';
	import { formatBytes } from '$lib/utils';

	interface Props {
		disabled?: boolean;
	}

	let { disabled = false }: Props = $props();

	let localFiles = $derived(
		settingsStore.providerModelGroups.find(({ id }) => id === LOCAL_MODEL_PROVIDER_ID)?.models ?? []
	);
	let customLocalFiles = $derived(localFiles.filter((fileName) => !findLocalModelByFile(fileName)));
	let remoteGroups = $derived(
		settingsStore.providerModelGroups.filter(
			({ id, models }) => id !== LOCAL_MODEL_PROVIDER_ID && models.length
		)
	);
	let downloadPercent = $derived(Math.round(localModelsStore.progress?.percent ?? 0));

	let activeLabel = $derived.by(() => {
		const { model, provider } = settingsStore.config;
		if (!model) return 'Select a model';
		if (provider !== LOCAL_MODEL_PROVIDER_ID) return model;
		return findLocalModelByFile(model)?.name ?? model;
	});

	function selectedModel(providerId: string): string {
		return settingsStore.config.provider === providerId ? settingsStore.config.model : '';
	}

	function selectModel(provider: string, model: string): void {
		const { config } = settingsStore;
		if (config.provider === provider && config.model === model) return;
		settingsStore.updateConfig({ provider, model });
	}
</script>

{#snippet modelLabel(title: string, description: string)}
	<span class="grid min-w-0 gap-0.5">
		<span class="truncate font-medium">{title}</span>
		<span class="truncate text-[11px] text-muted-foreground">{description}</span>
	</span>
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				aria-label={`Model: ${activeLabel}`}
				class="h-8 min-w-0 shrink rounded-full text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
				{disabled}
				size="sm"
				variant="ghost"
			>
				{#if localModelsStore.downloadingFile}
					<Download aria-hidden="true" class="size-3.5" />
					<span class="tabular-nums">{downloadPercent}%</span>
				{/if}
				<span class="truncate">{activeLabel}</span>
				<ChevronDown class="size-3" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-72" side="top" sideOffset={8}>
		<DropdownMenu.RadioGroup
			onValueChange={(model) => selectModel(LOCAL_MODEL_PROVIDER_ID, model)}
			value={selectedModel(LOCAL_MODEL_PROVIDER_ID)}
		>
			<DropdownMenu.GroupHeading>Local models</DropdownMenu.GroupHeading>
			{#each LOCAL_MODELS as model (model.fileName)}
				{#if localFiles.includes(model.fileName)}
					<DropdownMenu.RadioItem value={model.fileName}>
						{@render modelLabel(model.name, model.vendor)}
					</DropdownMenu.RadioItem>
				{:else if localModelsStore.downloadingFile === model.fileName}
					<div class="grid gap-1.5 py-1.5 pr-2 pl-8 text-sm">
						{@render modelLabel(model.name, `Downloading… ${downloadPercent}%`)}
						<Progress class="h-1.5" value={downloadPercent} />
					</div>
				{:else}
					<DropdownMenu.Item
						class="rounded-sm py-1.5 pr-2 pl-8 text-sm"
						closeOnSelect={false}
						disabled={localModelsStore.downloadingFile !== null}
						onSelect={() => void localModelsStore.download(model.fileName)}
					>
						{@render modelLabel(
							model.name,
							`Download ${formatBytes(model.sizeBytes)} · needs ~${model.minRamGiB} GiB RAM`
						)}
						<Download class="ml-auto" />
					</DropdownMenu.Item>
				{/if}
			{/each}
			{#each customLocalFiles as fileName (fileName)}
				<DropdownMenu.RadioItem value={fileName}>
					{@render modelLabel(fileName, 'Custom model')}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
		{#if localModelsStore.error}
			<p class="m-0 px-2 py-1 text-[11px] text-destructive">{localModelsStore.error}</p>
		{/if}
		{#each remoteGroups as group (group.id)}
			<DropdownMenu.Separator />
			<DropdownMenu.RadioGroup
				onValueChange={(model) => selectModel(group.id, model)}
				value={selectedModel(group.id)}
			>
				<DropdownMenu.GroupHeading>{group.name}</DropdownMenu.GroupHeading>
				{#each group.models as model (model)}
					<DropdownMenu.RadioItem value={model}>
						<span class="truncate">{model}</span>
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		{/each}
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => settingsDialogStore.show('models')}>
			<Settings />
			Manage models
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
