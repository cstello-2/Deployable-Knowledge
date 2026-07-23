<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		disabled: boolean;
		onSubmit: (audio: File) => void;
	}

	let { disabled, onSubmit }: Props = $props();

	let files = $state<FileList | undefined>(undefined);
	const audio = $derived(files?.item(0) ?? null);

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (audio) onSubmit(audio);
	}
</script>

<form class="grid gap-3" onsubmit={submit}>
	<Input
		accept="audio/wav"
		aria-label="WAV file"
		bind:files
		type="file"
	/>

	<Button disabled={!audio || disabled} type="submit">
		{disabled ? 'Transcribing…' : 'Transcribe audio'}
	</Button>
</form>