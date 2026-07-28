<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { Button } from '$lib/components/ui/button';
	import { documentViewerHref } from '$lib/constants';
	import type { ApiSearchMatch } from '$lib/types';

	interface Props {
		index?: number;
		result: ApiSearchMatch;
	}

	let { index = 0, result }: Props = $props();

	// Transcript chunks have no pages and no file to open, unlike PDF chunks
	const isTranscript = $derived(result.sourceType === 'AUDIO');
	const viewerHref = $derived(documentViewerHref(result.sourceType, result.documentId, result));
</script>

<article class="dk-panel grid gap-2 rounded-xl border p-3 shadow-sm">
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">#{index + 1}</span>
		<strong class="text-foreground">{result.sourceTitle}</strong>
		<span>{isTranscript ? 'Transcript' : `Page ${result.pageIndex + 1}`}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{result.content}</p>
	<div>
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
				<ExternalLink /> Show in PDF
			</Button>
		{/if}
	</div>
</article>
