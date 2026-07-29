<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookWithPages } from '$lib/types';
	import NotebookListItem from './NotebookListItem.svelte';
	import VerticalReorderList from './VerticalReorderList.svelte';

	interface Props {
		activeId: string | null;
		exportDisabled?: boolean;
		exportingId: string | null;
		notebooks: readonly NotebookWithPages[];
		onDelete: (notebook: NotebookWithPages) => void;
		onExport: (notebook: NotebookWithPages) => Promise<void> | void;
		onMove: (notebookId: string, targetIndex: number) => Promise<void> | void;
		onOpen: (notebook: NotebookWithPages) => void;
		onRename: (notebook: NotebookWithPages) => void;
		reorderDisabled?: boolean;
	}

	let {
		activeId,
		exportDisabled = false,
		exportingId,
		notebooks,
		onDelete,
		onExport,
		onMove,
		onOpen,
		onRename,
		reorderDisabled = false
	}: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<VerticalReorderList ariaLabel="Notebooks" disabled={reorderDisabled} items={notebooks} {onMove}>
		{#snippet item(notebook, reorderHandleProps)}
			<NotebookListItem
				active={notebook.id === activeId}
				{exportDisabled}
				exporting={notebook.id === exportingId}
				{notebook}
				onDelete={() => onDelete(notebook)}
				onExport={() => onExport(notebook)}
				onOpen={() => onOpen(notebook)}
				onRename={() => onRename(notebook)}
				reorderDisabled={reorderDisabled || notebooks.length < 2}
				{reorderHandleProps}
			/>
		{/snippet}
		{#snippet empty()}
			<Empty.Root class="border border-dashed"
				><Empty.Header
					><Empty.Title>No notebooks</Empty.Title><Empty.Description
						>Create a notebook to collect notes and chat responses.</Empty.Description
					></Empty.Header
				></Empty.Root
			>
		{/snippet}
	</VerticalReorderList>
</ScrollArea>
