<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import type { NotebookWithPages } from '$lib/types';
	import { notebookCountLabel } from './notebook-format';
	import NotebookItemMenu from './NotebookItemMenu.svelte';

	interface Props {
		active?: boolean;
		exportDisabled?: boolean;
		exporting?: boolean;
		notebook: NotebookWithPages;
		onDelete: () => void;
		onExport: () => Promise<void> | void;
		onOpen: () => void;
		onRename: () => void;
	}

	let {
		active = false,
		exportDisabled = false,
		exporting = false,
		notebook,
		onDelete,
		onExport,
		onOpen,
		onRename
	}: Props = $props();
</script>

<div
	class={[
		'dk-panel grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-xl border transition-[background-color,border-color] hover:bg-muted/60',
		active && 'border-primary bg-primary/10'
	]}
>
	<button
		aria-current={active ? 'true' : undefined}
		class="flex min-w-0 cursor-pointer items-center gap-2.5 bg-transparent px-3 py-2 text-left"
		onclick={onOpen}
		type="button"
	>
		<BookOpen class="size-4 shrink-0 text-muted-foreground" />
		<span class="grid min-w-0 gap-0.5"
			><strong class="truncate text-sm">{notebook.title}</strong><small
				class="text-muted-foreground">{notebookCountLabel(notebook.pages.length, 'page')}</small
			></span
		>
	</button>
	<NotebookItemMenu
		{exportDisabled}
		{exporting}
		kind="notebook"
		label={notebook.title}
		{onDelete}
		{onExport}
		{onRename}
	/>
</div>
