<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Video from '@lucide/svelte/icons/video';
	import { Button } from '$lib/components/ui/button';
	import { documentViewerHref } from '$lib/constants';
	import type { ApiSearchMatch } from '$lib/types';

	interface Props {
		index?: number;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: (result: ApiSearchMatch) => Promise<void> | void;
		result: ApiSearchMatch;
	}

	let { index = 0, onSaveChunk, onSendToNotebook, result }: Props = $props();

	// Transcript chunks have no pages and no file to open, unlike PDF chunks
	const isTranscript = $derived(result.sourceType === 'AUDIO' || result.sourceType === 'YOUTUBE');
	const isVideo = $derived(result.sourceType === 'YOUTUBE');

	function describeLocation(match: ApiSearchMatch): string {
		if (match.sourceType === 'AUDIO' || match.sourceType === 'YOUTUBE') return 'Transcript';
		if (match.sourceType === 'XLSX') return `Sheet ${match.pageIndex + 1}`;
		return `Page ${match.pageIndex + 1}`;
	}

	const locationLabel = $derived(describeLocation(result));
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
		<Button variant="outline" size="sm" onclick={() => onSendToNotebook(result)}>
			<BookOpen /> Send to notebook
		</Button>
		{#if isVideo}
			<Button variant="outline" size="sm" href={viewerHref}>
				<Video /> Open transcript
			</Button>
		{:else if isTranscript}
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
