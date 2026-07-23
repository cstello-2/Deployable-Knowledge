<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { LOCAL_MODEL_PROVIDER_ID } from '$lib/constants';
	import { localModelsStore, settingsStore } from '$lib/stores';
	import { formatBytes } from '$lib/utils';
	import type { LocalModelCardData } from './local-model-catalog';

	interface Props {
		model: LocalModelCardData;
		onDelete: (fileName: string) => void;
	}

	let { model, onDelete }: Props = $props();

	const info = $derived(
		localModelsStore.status?.models.find((entry) => entry.fileName === model.fileName)
	);
	const downloaded = $derived(info?.downloaded ?? false);
	const active = $derived(
		settingsStore.config.provider === LOCAL_MODEL_PROVIDER_ID &&
			settingsStore.config.model === model.fileName
	);
	const downloading = $derived(localModelsStore.downloadingFile === model.fileName);
	const percent = $derived(Math.max(0, Math.min(100, localModelsStore.progress?.percent ?? 0)));
</script>

<article class="flex flex-col gap-3 rounded-xl border bg-card/50 p-4">
	<div class="flex items-start gap-3">
		<span class="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
			{#if model.icon}
				<model.icon class="size-8" />
			{:else}
				<Box class="size-6 text-muted-foreground" />
			{/if}
		</span>
		<div class="grid min-w-0 gap-0.5">
			<span class="flex flex-wrap items-center gap-2 text-sm font-semibold">
				<span class="break-all">{model.name}</span>
				{#if active}
					<Badge variant="tertiary">Active</Badge>
				{/if}
			</span>
			<span class="text-xs text-muted-foreground">{model.vendor}</span>
		</div>
	</div>

	{#if model.description}
		<p class="m-0 text-xs text-muted-foreground">{model.description}</p>
	{/if}

	{#if model.downloadSizeBytes !== null && model.minRamGiB !== null}
		<span class="text-xs text-muted-foreground">
			{formatBytes(model.downloadSizeBytes)} download · needs ~{model.minRamGiB} GiB RAM
		</span>
	{:else if info?.sizeBytes}
		<span class="text-xs text-muted-foreground">{formatBytes(info.sizeBytes)} on disk</span>
	{/if}

	<div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
		{#if downloading}
			<div class="grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
				<Progress value={percent} />
				<span class="text-right text-xs tabular-nums">{Math.round(percent)}%</span>
			</div>
		{:else if downloaded}
			<Button
				size="sm"
				variant="outline"
				disabled={active}
				onclick={() => void localModelsStore.activateModel(model.fileName)}
			>
				Use this model
			</Button>
			<Button size="sm" variant="destructive" onclick={() => onDelete(model.fileName)}>
				Delete
			</Button>
		{:else if model.downloadable}
			<Button
				size="sm"
				disabled={localModelsStore.downloadingFile !== null}
				onclick={() => void localModelsStore.download(model.fileName)}
			>
				Download
			</Button>
		{/if}
	</div>
</article>
