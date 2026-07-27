<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookWithPages } from '$lib/types';
	import NotebookListItem from './NotebookListItem.svelte';

	interface Props {
		activeId: string | null;
		notebooks: readonly NotebookWithPages[];
		onDelete: (notebook: NotebookWithPages) => void;
		onOpen: (notebook: NotebookWithPages) => void;
		onRename: (notebook: NotebookWithPages) => void;
	}

	let { activeId, notebooks, onDelete, onOpen, onRename }: Props = $props();
</script>

<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
	<nav class="grid content-start gap-2 p-3" aria-label="Notebooks">
		{#each notebooks as notebook (notebook.id)}
			<NotebookListItem
				{notebook}
				active={notebook.id === activeId}
				onOpen={() => onOpen(notebook)}
				onRename={() => onRename(notebook)}
				onDelete={() => onDelete(notebook)}
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
