<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { formatBytes } from '$lib/utils';
	import type { LocalModelCardData } from './local-model-catalog';

	interface Props {
		active: boolean;
		downloadDisabled: boolean;
		downloaded: boolean;
		downloading: boolean;
		model: LocalModelCardData;
		onDelete?: () => void;
		onDownload: () => void;
		onUse: () => void;
		percent: number;
		sizeOnDiskBytes?: number | null;
	}

	let {
		active,
		downloadDisabled,
		downloaded,
		downloading,
		model,
		onDelete,
		onDownload,
		onUse,
		percent,
		sizeOnDiskBytes = null
	}: Props = $props();
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
			{#if model.license && model.licenseUrl}
				<!-- The catalog only supplies absolute vendor URLs, which resolve() does not apply to. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={model.licenseUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="w-fit rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					{model.license}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</div>

	{#if model.description}
		<p class="m-0 text-xs text-muted-foreground">{model.description}</p>
	{/if}

	{#if model.downloadSizeBytes !== null}
		<span class="text-xs text-muted-foreground">
			{formatBytes(model.downloadSizeBytes)} download
			{#if model.minRamGiB !== null}· needs ~{model.minRamGiB} GiB RAM{/if}
		</span>
	{:else if sizeOnDiskBytes}
		<span class="text-xs text-muted-foreground">{formatBytes(sizeOnDiskBytes)} on disk</span>
	{/if}

	<div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
		{#if downloading}
			<div class="grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
				<Progress value={percent} />
				<span class="text-right text-xs tabular-nums">{Math.round(percent)}%</span>
			</div>
		{:else if downloaded}
			<Button disabled={active} onclick={onUse} size="sm" variant="outline">Use this model</Button>
			{#if onDelete}
				<Button onclick={onDelete} size="sm" variant="destructive">Delete</Button>
			{/if}
		{:else if model.downloadable}
			<Button disabled={downloadDisabled} onclick={onDownload} size="sm">Download</Button>
		{/if}
	</div>
</article>
