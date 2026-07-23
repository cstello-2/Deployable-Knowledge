<script lang="ts">
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import { Button } from '$lib/components/ui/button';
	import { transcriptionStore } from '$lib/stores';
	import TranscriptViewer from './TranscriptViewer.svelte';
	import TranscriptionUpload from './TranscriptionUpload.svelte';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onClose = () => {},
		onToggleCollapse = () => {}
	}: Props = $props();
</script>

<WorkspaceWindow
	{id}
	{title}
	{closable}
	{height}
	{collapsed}
	{onClose}
	{onToggleCollapse}
	contentLabel="Audio transcription"
>
	<div class="grid min-h-full content-start gap-3 p-1">
		<p class="text-sm text-muted-foreground">
			English transcription runs locally with Transformers.js.
		</p>

		<TranscriptionUpload
			disabled={transcriptionStore.loading}
			onSubmit={(audio) => void transcriptionStore.transcribe(audio)}
		/>

		{#if transcriptionStore.error}
			<p class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
				{transcriptionStore.error}
			</p>
		{/if}

		{#if transcriptionStore.result}
			<Button onclick={() => transcriptionStore.clear()} variant="outline">
				Clear transcript
			</Button>
		{/if}

		<TranscriptViewer result={transcriptionStore.result} />
	</div>
</WorkspaceWindow>