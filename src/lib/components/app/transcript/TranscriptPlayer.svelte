<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import type { ApiTranscriptResponse } from '$lib/types';
	import TranscriptChunk from './TranscriptChunk.svelte';
	import { formatTimestamp } from './timestamp';

	interface Props {
		audioSrc: string;
		chunks: ApiTranscriptResponse['chunks'];
		document: ApiTranscriptResponse['document'];
		focusChunkIndex?: number | null;
	}

	let { audioSrc, chunks, document, focusChunkIndex = null }: Props = $props();

	const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

	let audio = $state<HTMLAudioElement>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let muted = $state(false);
	let playbackRate = $state(1);
	let rows = $state<(HTMLElement | undefined)[]>([]);
	let focused = $state(false);
	let followPlayback = $state(false);
	let pendingSeekMs = $state<number | null>(null);
	let scrubbing = false;

	const timed = $derived(chunks.some((chunk) => chunk.startMs !== null));
	const currentMs = $derived(currentTime * 1000);
	const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
	const focusIndex = $derived(
		focusChunkIndex === null
			? -1
			: chunks.findIndex((chunk) => chunk.chunkIndex === focusChunkIndex)
	);

	const activeIndex = $derived.by(() => {
		if (!timed) return -1;

		let candidate = -1;

		for (const [index, chunk] of chunks.entries()) {
			if (chunk.startMs === null || chunk.startMs > currentMs) continue;
			candidate = index;
		}

		return candidate;
	});

	const highlightIndex = $derived(!followPlayback && focusIndex >= 0 ? focusIndex : activeIndex);

	// Following along is only helpful while audio is actually moving
	$effect(() => {
		if (paused || activeIndex < 0) return;
		rows[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	});

	// Arriving from a citation lines the audio up with the quoted chunk without starting playback
	$effect(() => {
		if (focused || focusIndex < 0) return;
		focused = true;

		rows[focusIndex]?.scrollIntoView({ block: 'center' });
		const startMs = chunks[focusIndex]?.startMs;
		if (startMs === null || startMs === undefined) return;

		pendingSeekMs = startMs;
		applyPendingSeek();
	});

	// Seeking before metadata loads is discarded, so a pending position is replayed on load
	function applyPendingSeek() {
		if (pendingSeekMs === null || !audio || !Number.isFinite(audio.duration)) return;
		audio.currentTime = pendingSeekMs / 1000;
		pendingSeekMs = null;
	}

	function seek(startMs: number) {
		if (!audio) return;
		followPlayback = true;
		pendingSeekMs = null;
		audio.currentTime = startMs / 1000;
		void audio.play();
	}

	function togglePlayback() {
		if (!audio) return;
		if (audio.paused) void audio.play();
		else audio.pause();
	}

	function skip(seconds: number) {
		if (!audio) return;
		followPlayback = true;
		pendingSeekMs = null;
		const target = audio.currentTime + seconds;
		audio.currentTime =
			duration > 0 ? Math.min(Math.max(0, target), duration) : Math.max(0, target);
	}

	function seekToRatio(ratio: number) {
		if (!audio || duration <= 0) return;
		followPlayback = true;
		pendingSeekMs = null;
		audio.currentTime = Math.min(Math.max(0, ratio), 1) * duration;
	}

	function scrubToPointer(event: PointerEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		seekToRatio((event.clientX - rect.left) / rect.width);
	}

	function onTrackPointerDown(event: PointerEvent) {
		if (duration <= 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		scrubbing = true;
		scrubToPointer(event);
	}

	function onTrackPointerMove(event: PointerEvent) {
		if (scrubbing) scrubToPointer(event);
	}

	function onTrackPointerUp() {
		scrubbing = false;
	}

	function onTrackKeydown(event: KeyboardEvent) {
		if (duration <= 0) return;
		if (event.key === 'ArrowLeft') skip(-5);
		else if (event.key === 'ArrowRight') skip(5);
		else if (event.key === 'Home') seekToRatio(0);
		else if (event.key === 'End') seekToRatio(1);
		else return;
		event.preventDefault();
	}

	function cycleSpeed() {
		playbackRate = SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length];
	}
</script>

<main
	aria-labelledby="transcript-page-title"
	class="flex h-full flex-col bg-linear-to-b from-card to-elevated"
>
	<div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
		<div class="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
			<header class="grid min-w-0 gap-1 border-b pb-5">
				<h1
					class="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight"
					id="transcript-page-title"
				>
					<AudioLines class="size-5 shrink-0 text-muted-foreground" />
					<span class="min-w-0 truncate">{document.title}</span>
				</h1>
				<p class="m-0 text-xs text-muted-foreground">
					{chunks.length}
					{chunks.length === 1 ? 'chunk' : 'chunks'}
					{#if duration > 0}· {formatTimestamp(duration * 1000)} total{/if}
					{#if timed}
						· following chunk {highlightIndex >= 0 ? highlightIndex + 1 : '–'}
					{:else}
						· transcribed before timings were recorded, so playback cannot follow along
					{/if}
				</p>
			</header>

			<div class="grid gap-2">
				{#each chunks as chunk, index (chunk.id)}
					<div bind:this={rows[index]} class="scroll-my-2">
						<TranscriptChunk active={index === highlightIndex} {chunk} onSeek={seek} />
					</div>
				{/each}
			</div>
		</div>
	</div>

	<footer class="dk-panel z-10 shrink-0 border-t">
		<audio
			bind:this={audio}
			bind:currentTime
			bind:duration
			bind:muted
			bind:paused
			bind:playbackRate
			class="hidden"
			preload="metadata"
			src={audioSrc}
			onloadedmetadata={applyPendingSeek}
			onplay={() => (followPlayback = true)}
		></audio>
		<div class="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
			<ActionIcon
				class="shrink-0 rounded-full"
				label={paused ? 'Play' : 'Pause'}
				variant="default"
				onclick={togglePlayback}
			>
				{#if paused}<Play />{:else}<Pause />{/if}
			</ActionIcon>

			<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
				{formatTimestamp(currentMs)}
			</span>

			<div
				aria-label="Seek"
				aria-valuemax={Math.round(duration)}
				aria-valuemin={0}
				aria-valuenow={Math.round(currentTime)}
				aria-valuetext="{formatTimestamp(currentMs)} of {formatTimestamp(duration * 1000)}"
				class="group relative flex h-8 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/40"
				role="slider"
				tabindex="0"
				onkeydown={onTrackKeydown}
				onpointercancel={onTrackPointerUp}
				onpointerdown={onTrackPointerDown}
				onpointermove={onTrackPointerMove}
				onpointerup={onTrackPointerUp}
			>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
					<div class="h-full rounded-full bg-primary" style:width="{progress}%"></div>
				</div>
				<div
					class="absolute size-3 -translate-x-1/2 rounded-full border border-primary bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
					style:left="{progress}%"
				></div>
			</div>

			<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
				{duration > 0 ? formatTimestamp(duration * 1000) : '–:––'}
			</span>

			<div class="flex shrink-0 items-center gap-1">
				<Button
					aria-label="Playback speed"
					class="w-12 px-0 font-mono tabular-nums"
					size="sm"
					variant="ghost"
					onclick={cycleSpeed}
				>
					{playbackRate}×
				</Button>
				<ActionIcon
					label={muted ? 'Unmute' : 'Mute'}
					variant="ghost"
					onclick={() => (muted = !muted)}
				>
					{#if muted}<VolumeX />{:else}<Volume2 />{/if}
				</ActionIcon>
			</div>
		</div>
	</footer>
</main>
