<script lang="ts">
	import CheckSquare from '@lucide/svelte/icons/square-check-big';
	import Square from '@lucide/svelte/icons/square';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookPage } from '$lib/types';

	type ExportFormat = 'markdown' | 'pdf';

	interface Props {
		onExport: (format: ExportFormat, pageIds: string[]) => Promise<void> | void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		pages: readonly NotebookPage[];
	}

	let { onExport, onOpenChange, open, pages }: Props = $props();
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
			<Dialog.Title>Export notebook pages</Dialog.Title>
			<Dialog.Description>
				All pages are selected by default. Leave out any pages you do not want.
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
			<Button
				variant="outline"
				disabled={!selectedPageIds.length}
				onclick={() => onExport('markdown', selectedPageIds)}>Download Markdown</Button
			>
			<Button disabled={!selectedPageIds.length} onclick={() => onExport('pdf', selectedPageIds)}
				>Download PDF</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
