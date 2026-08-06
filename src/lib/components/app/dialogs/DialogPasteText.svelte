<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { title: string; content: string }) => Promise<void> | void;
		open: boolean;
	}

	let { onOpenChange, onSubmit, open }: Props = $props();
	let title = $state('');
	let content = $state('');

	$effect(() => {
		if (!open) return;
		title = '';
		content = '';
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!content.trim()) return;
		await onSubmit({ title: title.trim(), content });
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Paste text</Dialog.Title>
				<Dialog.Description
					>Add pasted or typed text straight to the document library.</Dialog.Description
				>
			</Dialog.Header>

			<div class="grid gap-2">
				<Label for="paste-text-title">Title</Label><Input
					id="paste-text-title"
					bind:value={title}
					placeholder="Untitled"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="paste-text-content">Text</Label><Textarea
					id="paste-text-content"
					class="min-h-60"
					bind:value={content}
					placeholder="Paste or type text here..."
					required
				/>
			</div>

			<Dialog.Footer>
				<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button disabled={!content.trim()} type="submit">Add to library</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
