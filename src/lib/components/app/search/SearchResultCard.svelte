<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Video from '@lucide/svelte/icons/video';
	import { Button } from '$lib/components/ui/button';
	import { documentViewerHref } from '$lib/constants';
	import type { ApiSearchMatch, ChunkRatingValue } from '$lib/types';
	import { describeDocumentLocation } from '$lib/utils';
	import SearchResultRating from './SearchResultRating.svelte';

	interface Props {
		index?: number;
		onRatingChange: (rating: ChunkRatingValue | null) => Promise<void> | void;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: (result: ApiSearchMatch) => Promise<void> | void;
		rating: ChunkRatingValue | null;
		ratingSaving?: boolean;
		result: ApiSearchMatch;
	}

	let {
		index = 0,
		onRatingChange,
		onSaveChunk,
		onSendToNotebook,
		rating,
		ratingSaving = false,
		result
	}: Props = $props();

	const isTranscript = $derived(result.sourceType === 'AUDIO' || result.sourceType === 'YOUTUBE');
	const isVideo = $derived(result.sourceType === 'YOUTUBE');
	const locationLabel = $derived(describeDocumentLocation(result.sourceType, result.pageIndex));
	const viewerHref = $derived(documentViewerHref(result.sourceType, result.documentId, result));
</script>

<article class="dk-panel grid gap-2 rounded-xl border p-3 shadow-sm">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
			<span class="font-semibold text-primary">#{index + 1}</span>
			<strong class="text-foreground">{result.sourceTitle}</strong>
			<span>{locationLabel}</span>
		</div>

		<SearchResultRating disabled={ratingSaving} onChange={onRatingChange} {rating} />
	</div>

	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{result.content}</p>

	<div class="flex flex-wrap gap-2">
		<Button onclick={() => onSaveChunk(result.chunkId)} size="sm" variant="outline">
			<BookmarkPlus /> Save chunk
		</Button>

		<Button onclick={() => onSendToNotebook(result)} size="sm" variant="outline">
			<BookOpen /> Send to notebook
		</Button>

		{#if isVideo}
			<Button href={viewerHref} size="sm" variant="outline">
				<Video /> Open transcript
			</Button>
		{:else if isTranscript}
			<Button href={viewerHref} size="sm" variant="outline">
				<AudioLines /> Play this chunk
			</Button>
		{:else}
			<Button
				href={viewerHref}
				rel="noopener noreferrer"
				size="sm"
				target="_blank"
				variant="outline"
			>
				<ExternalLink /> Open document
			</Button>
		{/if}
	</div>
</article>
