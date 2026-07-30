<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookPage } from '$lib/types';
	import { notebookPagePreview } from './notebook-format';
	import type { ReorderHandleProps } from './notebook-types';
	import NotebookItemMenu from './NotebookItemMenu.svelte';

	interface Props {
		active?: boolean;
		exportDisabled?: boolean;
		exporting?: boolean;
		onDelete: () => void;
		onExport: () => Promise<void> | void;
		onMove: () => void;
		onOpen: () => void;
		onRename: () => void;
		page: NotebookPage;
		reorderDisabled?: boolean;
		reorderHandleProps: ReorderHandleProps;
	}

	let {
		active = false,
		exportDisabled = false,
		exporting = false,
		onDelete,
		onExport,
		onMove,
		onOpen,
		onRename,
		page,
		reorderDisabled = false,
		reorderHandleProps
	}: Props = $props();
</script>

<div
	class={[
		'dk-panel grid grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden rounded-xl border transition-[background-color,border-color] hover:bg-muted/60',
		active && 'border-primary bg-primary/10'
	]}
>
	<ActionIcon
		class="ml-1 size-7 touch-none cursor-grab border-0 bg-transparent shadow-none active:cursor-grabbing"
		disabled={reorderDisabled}
		label={`Reorder ${page.title}`}
		size="icon-sm"
		triggerProps={reorderHandleProps}
		variant="ghost"
	>
		<GripVertical />
	</ActionIcon>
	<button
		aria-current={active ? 'page' : undefined}
		class="flex min-w-0 cursor-pointer items-center gap-2.5 bg-transparent px-3 py-2 text-left"
		onclick={onOpen}
		type="button"
	>
		<FileText class="size-4 shrink-0 text-muted-foreground" />
		<span class="grid min-w-0 gap-0.5"
			><strong class="truncate text-sm">{page.title}</strong><small
				class="truncate text-muted-foreground">{notebookPagePreview(page.content)}</small
			></span
		>
	</button>
	<NotebookItemMenu
		{exportDisabled}
		{exporting}
		kind="page"
		label={page.title}
		{onDelete}
		{onExport}
		{onMove}
		{onRename}
	/>
</div>
