<script lang="ts">
	import { TranscriptPlayer, YoutubeTranscript } from '$lib/components/app/transcript';
	import { parseYoutubeVideoId } from '$lib/utils';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const videoId = $derived(
		data.document.sourceType === 'YOUTUBE' ? parseYoutubeVideoId(data.document.sourcePath) : null
	);
</script>

<svelte:head>
	<title>{data.document.title} · Transcript · Deployable Knowledge</title>
</svelte:head>

{#if videoId}
	<YoutubeTranscript
		chunks={data.chunks}
		document={data.document}
		focusChunkIndex={data.focusChunkIndex}
		{videoId}
	/>
{:else}
	<TranscriptPlayer
		audioSrc="/transcripts/{data.document.id}/audio"
		chunks={data.chunks}
		document={data.document}
		focusChunkIndex={data.focusChunkIndex}
	/>
{/if}
