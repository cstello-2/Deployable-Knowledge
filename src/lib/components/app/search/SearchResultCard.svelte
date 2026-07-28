<script lang="ts">
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { Button } from '$lib/components/ui/button';
	import { API_DOCUMENT_FILES } from '$lib/constants';
	import type { ApiSearchMatch } from '$lib/types';

	interface Props {
		index?: number;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		result: ApiSearchMatch;
	}

	let { index = 0, onSaveChunk, result }: Props = $props();

	// Transcript chunks have no pages and no file to open, unlike PDF chunks
	const isTranscript = $derived(result.sourceType === 'AUDIO');
</script>

<article class="dk-panel grid gap-2 rounded-xl border p-3 shadow-sm">
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">#{index + 1}</span>
		<strong class="text-foreground">{result.sourceTitle}</strong>
		<span>{isTranscript ? 'Transcript' : `Page ${result.pageIndex + 1}`}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{result.content}</p>
	<div>
		<Button variant="outline" size="sm" onclick={() => onSaveChunk(result.chunkId)}>
			<BookmarkPlus /> Save chunk
		</Button>
		{#if !isTranscript}
			<Button
				class="ml-2"
				variant="outline"
				size="sm"
				href={`${API_DOCUMENT_FILES.byId(result.documentId)}#page=${result.pageIndex + 1}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				<ExternalLink /> Show in PDF
			</Button>
		{/if}
	</div>
</article>
