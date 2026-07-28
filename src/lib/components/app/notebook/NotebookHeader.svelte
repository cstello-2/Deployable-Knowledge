<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import NotebookHeaderActions from './NotebookHeaderActions.svelte';
	import type { NotebookView } from './notebook-types';

	interface Props {
		exporting?: boolean;
		importing?: boolean;
		onBack: () => void;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onExport: () => Promise<void> | void;
		onImport: () => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onTogglePreview: () => void;
		previewMode?: boolean;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		title: string;
		view: NotebookView;
	}

	let {
		exporting = false,
		importing = false,
		onBack,
		onClearSources,
		onCreate,
		onExport,
		onImport,
		onInsertCitation,
		onRemoveSource,
		onTogglePreview,
		previewMode = false,
		sources,
		sourcesLoading = false,
		title,
		view
	}: Props = $props();
</script>

<header class="flex h-11 items-center gap-2 border-b bg-card/70 px-3">
	{#if view !== 'notebooks'}
		<ActionIcon
			class="size-8"
			label={view === 'editor' ? 'Back to pages' : 'Back to notebooks'}
			onclick={onBack}
			variant="ghost"><ArrowLeft /></ActionIcon
		>
	{/if}
	<h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
	<NotebookHeaderActions
		{exporting}
		{importing}
		{onClearSources}
		{onCreate}
		{onExport}
		{onImport}
		{onInsertCitation}
		{onRemoveSource}
		{onTogglePreview}
		{previewMode}
		{sources}
		{sourcesLoading}
		{view}
	/>
</header>
