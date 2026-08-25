<script lang="ts">
	import Video from '@lucide/svelte/icons/video';
	import { Button } from '$lib/components/ui/button';
	import type { ApiTranscriptResponse } from '$lib/types';
	import { watchUrl, watchUrlAtMs } from '$lib/utils';
	import TranscriptChunk from './TranscriptChunk.svelte';
	import { formatTimestamp } from './timestamp';

	interface Props {
		chunks: ApiTranscriptResponse['chunks'];
		document: ApiTranscriptResponse['document'];
		focusChunkIndex?: number | null;
		videoId: string;
	}

	let { chunks, document, focusChunkIndex = null, videoId }: Props = $props();

	let rows = $state<(HTMLElement | undefined)[]>([]);
	let focused = $state(false);

	const lastEndMs = $derived(chunks[chunks.length - 1]?.endMs ?? null);
	const focusIndex = $derived(
		focusChunkIndex === null
			? -1
			: chunks.findIndex((chunk) => chunk.chunkIndex === focusChunkIndex)
	);

	$effect(() => {
		if (focused || focusIndex < 0) return;
		focused = true;
		rows[focusIndex]?.scrollIntoView({ block: 'center' });
	});

	function openAt(startMs: number): void {
		window.open(watchUrlAtMs(videoId, startMs), '_blank', 'noopener');
	}
</script>

<main
	aria-labelledby="transcript-page-title"
	class="flex h-full flex-col bg-linear-to-b from-card to-elevated"
>
	<div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
		<div class="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
			<header class="grid min-w-0 gap-3 border-b pb-5">
				<h1
					class="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight"
					id="transcript-page-title"
				>
					<Video class="size-5 shrink-0 text-muted-foreground" />
					<span class="min-w-0 truncate">{document.title}</span>
				</h1>
				<p class="m-0 text-xs text-muted-foreground">
					{chunks.length}
					{chunks.length === 1 ? 'chunk' : 'chunks'}
					{#if lastEndMs !== null}· {formatTimestamp(lastEndMs)} total{/if}
					· select a chunk to open the video at that moment
				</p>
				<div>
					<Button
						href={watchUrl(videoId)}
						rel="noreferrer"
						size="sm"
						target="_blank"
						variant="outline"
					>
						<Video /> Watch on YouTube
					</Button>
				</div>
			</header>

			<div class="grid gap-2">
				{#each chunks as chunk, index (chunk.id)}
					<div bind:this={rows[index]} class="scroll-my-2">
						<TranscriptChunk active={index === focusIndex} {chunk} onSeek={openAt} />
					</div>
				{/each}
			</div>
		</div>
	</div>
</main>
