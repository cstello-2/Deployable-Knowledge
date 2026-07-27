<script lang="ts">
	import TagPaletteItem from '$lib/components/app/documents/TagPaletteItem.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	interface Props {
		onOpenChange: (open: boolean) => void;
		onSelect: (tag: string) => void;
		open: boolean;
		tags: string[];
		title?: string;
	}

	let { onOpenChange, onSelect, open, tags, title = 'Choose tag' }: Props = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content>
		<Dialog.Header
			><Dialog.Title>{title}</Dialog.Title><Dialog.Description
				>Select a tag for the chosen documents.</Dialog.Description
			></Dialog.Header
		>
		<div class="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
			{#each tags as tag (tag)}
				<TagPaletteItem onToggle={() => onSelect(tag)} {tag} />
			{:else}
				<p class="text-sm text-muted-foreground">No tags available.</p>
			{/each}
		</div>
		<Dialog.Footer
			><Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button></Dialog.Footer
		>
	</Dialog.Content>
</Dialog.Root>
