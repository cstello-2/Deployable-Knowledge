<script lang="ts">
	import { TranscriptPlayer } from '$lib/components/app/transcript';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>{data.document.title} · Transcript · Deployable Knowledge</title>
</svelte:head>

<TranscriptPlayer
	audioSrc="/transcripts/{data.document.id}/audio"
	chunks={data.chunks}
	document={data.document}
	focusChunkIndex={data.focusChunkIndex}
/>
