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

	const pdfBacked = $derived(['PDF', 'DOCX', 'PPTX', 'XLSX'].includes(data.document.sourceType));
	const iframeSrc = $derived(
		browser ? `${API_DOCUMENT_FILES.byId(data.document.id)}${location.hash}` : ''
	);
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
					<MarkdownContent content={data.content ?? ''} />
				{:else}
					<pre class="m-0 text-sm leading-relaxed whitespace-pre-wrap">{data.content}</pre>
				{/if}
			</div>
		</div>
	{/if}
</section>
