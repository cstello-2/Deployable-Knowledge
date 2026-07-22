<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookPage } from '$lib/types';
	import NotebookPageListItem from './NotebookPageListItem.svelte';

	interface Props {
		activeId: string | null;
		onDelete: (page: NotebookPage) => void;
		onOpen: (page: NotebookPage) => void;
		onRename: (page: NotebookPage) => void;
		pages: NotebookPage[];
	}

	let { activeId, onDelete, onOpen, onRename, pages }: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<nav class="grid content-start gap-2 p-3" aria-label="Notebook pages">
		{#each pages as page (page.id)}
			<NotebookPageListItem
				{page}
				active={page.id === activeId}
				onOpen={() => onOpen(page)}
				onRename={() => onRename(page)}
				onDelete={() => onDelete(page)}
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
