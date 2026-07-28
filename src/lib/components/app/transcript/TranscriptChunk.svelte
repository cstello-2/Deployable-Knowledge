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
</script>

<button
	aria-current={active ? 'true' : undefined}
	class={[
		'dk-panel grid w-full gap-2 rounded-xl border p-3 text-left shadow-sm transition-colors',
		active && 'border-primary bg-primary/5',
		seekable ? 'cursor-pointer' : 'cursor-default',
		seekable && !active && 'hover:border-primary/40'
	]}
	disabled={!seekable}
	type="button"
	onclick={() => chunk.startMs !== null && onSeek(chunk.startMs)}
>
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">Chunk {chunk.chunkIndex + 1}</span>
		<span class="font-mono">{range}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{chunk.content}</p>
</button>
