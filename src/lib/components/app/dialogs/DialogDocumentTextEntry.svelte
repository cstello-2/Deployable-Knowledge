<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		disabled?: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmit: (title: string, text: string) => void;
		open: boolean;
	}

	let { disabled = false, onOpenChange, onSubmit, open }: Props = $props();

	let title = $state('');
	let text = $state('');

	const submittable = $derived(Boolean(title.trim() && text.trim()));

	$effect(() => {
		if (open) {
			title = '';
			text = '';
		}
	});

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!submittable || disabled) return;
		onSubmit(title.trim(), text);
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Add text to corpus</Dialog.Title>
				<Dialog.Description>
					Embed pasted text directly into the document library. It is chunked and indexed like any
					other document and appears under “Manually Loaded”.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="document-text-title">Title</Label>
				<Input
					id="document-text-title"
					bind:value={title}
					autofocus
					maxlength={200}
					placeholder="Meeting notes, spec excerpt…"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="document-text-content">Text</Label>
				<Textarea
					id="document-text-content"
					bind:value={text}
					class="max-h-72 min-h-40"
					placeholder="Paste or write the text to embed. Markdown is preserved."
				/>
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button type="submit" disabled={!submittable || disabled}>Embed text</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
