<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookPage } from '$lib/types';
	import NotebookPageListItem from './NotebookPageListItem.svelte';
	import VerticalReorderList from './VerticalReorderList.svelte';

	interface Props {
		activeId: string | null;
		exportDisabled?: boolean;
		exportingId: string | null;
		onDelete: (page: NotebookPage) => void;
		onExport: (page: NotebookPage) => Promise<void> | void;
		onMove: (page: NotebookPage) => void;
		onOpen: (page: NotebookPage) => void;
		onRename: (page: NotebookPage) => void;
		onReorder: (pageId: string, targetIndex: number) => Promise<void> | void;
		pages: readonly NotebookPage[];
		reorderDisabled?: boolean;
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
		onReorder,
		pages,
		reorderDisabled = false
	}: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<VerticalReorderList
		ariaLabel="Notebook pages"
		disabled={reorderDisabled}
		items={pages}
		onMove={onReorder}
	>
		{#snippet item(page, reorderHandleProps)}
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
				reorderDisabled={reorderDisabled || pages.length < 2}
				{reorderHandleProps}
			/>
		{/snippet}
		{#snippet empty()}
			<Empty.Root class="border border-dashed"
				><Empty.Header
					><Empty.Title>No pages</Empty.Title><Empty.Description
						>Create a page to start writing.</Empty.Description
					></Empty.Header
				></Empty.Root
			>
		{/snippet}
	</VerticalReorderList>
</ScrollArea>
