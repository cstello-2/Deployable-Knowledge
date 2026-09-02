<script lang="ts">
	import type { TranscriptChunkRow } from '$lib/types';
	import { formatTimestamp } from './timestamp';

	interface Props {
		active?: boolean;
		chunk: TranscriptChunkRow;
		onSeek: (startMs: number) => void;
	}

	let { active = false, chunk, onSeek }: Props = $props();

	const seekable = $derived(chunk.startMs !== null);

	const range = $derived(
		chunk.startMs === null
			? 'no timing'
			: `${formatTimestamp(chunk.startMs)} – ${formatTimestamp(chunk.endMs ?? chunk.startMs)}`
	);

	const cardClass = $derived([
		'grid w-full select-text gap-2 border-l-2 pl-3 text-left transition-colors',
		active ? 'border-primary' : 'border-transparent',
		seekable && 'cursor-pointer',
		seekable && !active && 'hover:border-primary/40'
	]);

	function seekUnlessSelecting(): void {
		if (chunk.startMs === null) return;
		if (window.getSelection()?.toString()) return;
		onSeek(chunk.startMs);
	}
</script>

{#snippet body()}
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">Chunk {chunk.chunkIndex + 1}</span>
		<span class="font-mono">{range}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{chunk.content}</p>
{/snippet}

{#if seekable}
	<button
		aria-current={active ? 'true' : undefined}
		class={cardClass}
		type="button"
		onclick={seekUnlessSelecting}
	>
		{@render body()}
	</button>
{:else}
	<div aria-current={active ? 'true' : undefined} class={cardClass}>
		{@render body()}
	</div>
{/if}
