<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { Button } from '$lib/components/ui/button';
	import { documentViewerHref } from '$lib/constants';
	import type { ApiSearchMatch } from '$lib/types';

	interface Props {
		index?: number;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		result: ApiSearchMatch;
	}

	let { index = 0, onSaveChunk, result }: Props = $props();

	// Transcript chunks have no pages and no file to open, unlike PDF chunks
	const isTranscript = $derived(result.sourceType === 'AUDIO');
	const locationLabel = $derived(
		isTranscript
			? 'Transcript'
			: result.sourceType === 'XLSX'
				? `Sheet ${result.pageIndex + 1}`
				: `Page ${result.pageIndex + 1}`
	);
	const viewerHref = $derived(documentViewerHref(result.sourceType, result.documentId, result));
</script>

<article class="dk-panel grid gap-2 rounded-xl border p-3 shadow-sm">
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">#{index + 1}</span>
		<strong class="text-foreground">{result.sourceTitle}</strong>
		<span>{locationLabel}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{result.content}</p>
	<div class="flex flex-wrap gap-2">
		<Button variant="outline" size="sm" onclick={() => onSaveChunk(result.chunkId)}>
			<BookmarkPlus /> Save chunk
		</Button>
		{#if isTranscript}
			<Button variant="outline" size="sm" href={viewerHref}>
				<AudioLines /> Play this chunk
			</Button>
		{:else}
			<Button
				variant="outline"
				size="sm"
				href={viewerHref}
				target="_blank"
				rel="noopener noreferrer"
			>
				<ExternalLink /> Open document
			</Button>
		{/if}
	</div>
</article>
