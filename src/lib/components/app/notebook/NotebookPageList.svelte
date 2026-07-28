<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookPage } from '$lib/types';
	import NotebookPageListItem from './NotebookPageListItem.svelte';

	interface Props {
		activeId: string | null;
		exportDisabled?: boolean;
		exportingId: string | null;
		onDelete: (page: NotebookPage) => void;
		onExport: (page: NotebookPage) => Promise<void> | void;
		onMove: (page: NotebookPage) => void;
		onOpen: (page: NotebookPage) => void;
		onRename: (page: NotebookPage) => void;
		pages: NotebookPage[];
	}

	let {
		activeId,
		exportDisabled = false,
		exportingId,
		onDelete,
		onExport,
		onMove,
		onOpen,
		onRename,
		pages
	}: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<nav aria-label="Notebook pages" class="grid content-start gap-2 p-3">
		{#each pages as page (page.id)}
			<NotebookPageListItem
				active={page.id === activeId}
				{exportDisabled}
				exporting={page.id === exportingId}
				onDelete={() => onDelete(page)}
				onExport={() => onExport(page)}
				onMove={() => onMove(page)}
				onOpen={() => onOpen(page)}
				onRename={() => onRename(page)}
				{page}
			/>
		{:else}
			<Empty.Root class="border border-dashed"
				><Empty.Header
					><Empty.Title>No pages</Empty.Title><Empty.Description
						>Create a page to start writing.</Empty.Description
					></Empty.Header
				></Empty.Root
			>
		{/each}
	</nav>
</ScrollArea>
