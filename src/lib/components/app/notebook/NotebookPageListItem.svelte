<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import type { NotebookPage } from '$lib/types';
	import { notebookPagePreview } from './notebook-format';
	import NotebookItemMenu from './NotebookItemMenu.svelte';

	interface Props {
		active?: boolean;
		onDelete: () => void;
		onMove: () => void;
		onOpen: () => void;
		onRename: () => void;
		page: NotebookPage;
	}

	let { active = false, onDelete, onMove, onOpen, onRename, page }: Props = $props();
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
		aria-current={active ? 'page' : undefined}
		onclick={onOpen}
	>
		<FileText class="size-4 shrink-0 text-muted-foreground" />
		<span class="grid min-w-0 gap-0.5"
			><strong class="truncate text-sm">{page.title}</strong><small
				class="truncate text-muted-foreground">{notebookPagePreview(page.content)}</small
			></span
		>
	</button>
	<NotebookItemMenu label={page.title} {onDelete} {onMove} {onRename} />
</div>
