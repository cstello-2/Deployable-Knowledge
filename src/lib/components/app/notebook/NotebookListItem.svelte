<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import type { NotebookWithPages } from '$lib/types';
	import { notebookCountLabel } from './notebook-format';
	import NotebookItemMenu from './NotebookItemMenu.svelte';

	interface Props {
		active?: boolean;
		notebook: NotebookWithPages;
		onDelete: () => void;
		onOpen: () => void;
		onRename: () => void;
	}

	let { active = false, notebook, onDelete, onOpen, onRename }: Props = $props();
</script>

<div
	class={[
		'dk-panel grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-xl border transition-[background-color,border-color] hover:bg-muted/60',
		active && 'border-primary bg-primary/10'
	]}
>
	<button
		class="flex min-w-0 cursor-pointer items-center gap-2.5 bg-transparent px-3 py-2 text-left"
		type="button"
		aria-current={active ? 'true' : undefined}
		onclick={onOpen}
	>
		<BookOpen class="size-4 shrink-0 text-muted-foreground" />
		<span class="grid min-w-0 gap-0.5"
			><strong class="truncate text-sm">{notebook.title}</strong><small
				class="text-muted-foreground">{notebookCountLabel(notebook.pages.length, 'page')}</small
			></span
		>
	</button>
	<NotebookItemMenu label={notebook.title} {onDelete} {onRename} />
</div>
