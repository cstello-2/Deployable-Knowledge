<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { isYoutubeVideoUrl } from '$lib/utils';

	interface Props {
		disabled?: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmit: (url: string) => void;
		open: boolean;
	}

	let { disabled = false, onOpenChange, onSubmit, open }: Props = $props();

	let url = $state('');

	const submittable = $derived(isYoutubeVideoUrl(url));

	$effect(() => {
		if (open) url = '';
	});

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!submittable || disabled) return;
		onSubmit(url.trim());
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Add a YouTube video</Dialog.Title>
				<Dialog.Description>
					Imports the video's captions as a timestamped transcript. It is chunked and indexed like
					any other document and appears under “Manually Loaded”.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="document-youtube-url">Video link</Label>
				<Input
					id="document-youtube-url"
					bind:value={url}
					autofocus
					placeholder="https://www.youtube.com/watch?v=…"
					type="url"
				/>
				<p class="m-0 text-xs text-muted-foreground">
					Videos without captions cannot be imported. Shorts and youtu.be links work too.
				</p>
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button type="submit" disabled={!submittable || disabled}>Import transcript</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
