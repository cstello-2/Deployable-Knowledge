<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import { browser } from '$app/environment';
	import { MarkdownContent } from '$lib/components/app/content/MarkdownContent';
	import { API_DOCUMENT_FILES } from '$lib/constants';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let chunkElements = $state<(HTMLElement | undefined)[]>([]);
	let focused = $state(false);

	const pdfBacked = $derived(['PDF', 'DOCX', 'PPTX', 'XLSX'].includes(data.document.sourceType));
	const iframeSrc = $derived(
		browser ? `${API_DOCUMENT_FILES.byId(data.document.id)}${location.hash}` : ''
	);
	const segments = $derived(data.segments ?? []);
	const focusChunkIndex = $derived(data.focusChunkIndex ?? null);
	const focusIndex = $derived(
		focusChunkIndex === null
			? -1
			: segments.findIndex((segment) => segment.chunkIndexes.includes(focusChunkIndex))
	);

	$effect(() => {
		if (focused || focusIndex < 0) return;
		focused = true;
		chunkElements[focusIndex]?.scrollIntoView({ block: 'center' });
	});
</script>

<svelte:head>
	<title>{data.document.title} · Preview · Deployable Knowledge</title>
</svelte:head>

<section class="flex h-full min-h-0 flex-col bg-linear-to-b from-card to-elevated">
	<header class="flex min-w-0 items-center gap-2 border-b px-4 py-3 sm:px-6">
		<FileText class="size-5 shrink-0 text-muted-foreground" />
		<h1 class="m-0 min-w-0 truncate text-lg font-semibold tracking-tight">
			{data.document.title}
		</h1>
		{#if focusIndex >= 0}
			<span class="shrink-0 text-xs font-semibold text-primary">
				Chunk {(focusChunkIndex ?? 0) + 1}
			</span>
		{/if}
	</header>

	{#if pdfBacked}
		{#if data.previewAvailable === false}
			<p class="m-4 text-sm text-muted-foreground sm:mx-6">
				Preview unavailable for this spreadsheet. Its rows are still searchable in chat and search.
			</p>
		{:else if browser}
			<iframe class="min-h-0 w-full flex-1" src={iframeSrc} title={data.document.title}></iframe>
		{/if}
	{:else}
		<div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
			<div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
				{#if data.truncated}
					<p class="mb-4 text-xs text-muted-foreground">
						This file is large, so only the first part is shown.
					</p>
				{/if}
				{#if data.format === 'markdown'}
					<div class="grid gap-4">
						{#each segments as segment, index (index)}
							<div
								bind:this={chunkElements[index]}
								class={[
									'scroll-my-24 rounded-sm',
									index === focusIndex && 'bg-primary/15 ring-1 ring-primary/40'
								]}
								id={segment.chunkIndexes.length === 0
									? undefined
									: `chunk-${segment.chunkIndexes[0]}`}
							>
								<MarkdownContent content={segment.content} />
							</div>
						{/each}
					</div>
				{:else}
					<pre
						class="m-0 text-sm leading-relaxed whitespace-pre-wrap">{#each segments as segment, index (index)}<span
								bind:this={chunkElements[index]}
								class={[
									'scroll-my-24 rounded-sm',
									index === focusIndex && 'bg-primary/15 ring-1 ring-primary/40'
								]}
								id={segment.chunkIndexes.length === 0
									? undefined
									: `chunk-${segment.chunkIndexes[0]}`}>{segment.content}</span
							>{/each}</pre>
				{/if}
			</div>
		</div>
	{/if}
</section>
