<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookWithPages } from '$lib/types';
	import NotebookListItem from './NotebookListItem.svelte';

	interface Props {
		activeId: string | null;
		exportDisabled?: boolean;
		exportingId: string | null;
		notebooks: readonly NotebookWithPages[];
		onDelete: (notebook: NotebookWithPages) => void;
		onExport: (notebook: NotebookWithPages) => Promise<void> | void;
		onOpen: (notebook: NotebookWithPages) => void;
		onRename: (notebook: NotebookWithPages) => void;
	}

	let {
		activeId,
		exportDisabled = false,
		exportingId,
		notebooks,
		onDelete,
		onExport,
		onOpen,
		onRename
	}: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<nav aria-label="Notebooks" class="grid content-start gap-2 p-3">
		{#each notebooks as notebook (notebook.id)}
			<NotebookListItem
				active={notebook.id === activeId}
				{exportDisabled}
				exporting={notebook.id === exportingId}
				{notebook}
				onDelete={() => onDelete(notebook)}
				onExport={() => onExport(notebook)}
				onOpen={() => onOpen(notebook)}
				onRename={() => onRename(notebook)}
			/>
		{:else}
			<Empty.Root class="border border-dashed"
				><Empty.Header
					><Empty.Title>No notebooks</Empty.Title><Empty.Description
						>Create a notebook to collect notes and chat responses.</Empty.Description
					></Empty.Header
				></Empty.Root
			>
		{/each}
	</nav>
</ScrollArea>
