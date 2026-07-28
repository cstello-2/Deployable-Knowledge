<script lang="ts">
	import CheckSquare from '@lucide/svelte/icons/square-check-big';
	import Square from '@lucide/svelte/icons/square';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookPage } from '$lib/types';

	interface Props {
		onAdd: (pageIds: string[]) => Promise<void> | void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		pages: readonly NotebookPage[];
	}

	let { onAdd, onOpenChange, open, pages }: Props = $props();
	let selectedPageIds = $state<string[]>([]);
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) selectedPageIds = pages.map(({ id }) => id);
		wasOpen = open;
	});

	function toggle(pageId: string): void {
		selectedPageIds = selectedPageIds.includes(pageId)
			? selectedPageIds.filter((id) => id !== pageId)
			: [...selectedPageIds, pageId];
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add pages to Master Corpus</Dialog.Title>
			<Dialog.Description>
				Choose the notebook pages that should become searchable document chunks.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">
				{selectedPageIds.length}
				{selectedPageIds.length === 1 ? 'page' : 'pages'} selected
			</span>
			<div class="flex gap-1">
				<Button
					size="sm"
					variant="ghost"
					onclick={() => (selectedPageIds = pages.map(({ id }) => id))}>All</Button
				>
				<Button size="sm" variant="ghost" onclick={() => (selectedPageIds = [])}>None</Button>
			</div>
		</div>
		<ScrollArea class="max-h-72">
			<div class="grid gap-2 pr-3">
				{#each pages as page (page.id)}
					{@const selected = selectedPageIds.includes(page.id)}
					<Button
						class="justify-start"
						variant={selected ? 'secondary' : 'outline'}
						aria-pressed={selected}
						onclick={() => toggle(page.id)}
					>
						{#if selected}<CheckSquare />{:else}<Square />{/if}
						<span class="truncate">{page.title}</span>
					</Button>
				{/each}
			</div>
		</ScrollArea>
		<Dialog.Footer>
			<Button disabled={!selectedPageIds.length} onclick={() => onAdd(selectedPageIds)}
				>Add to Master Corpus</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
