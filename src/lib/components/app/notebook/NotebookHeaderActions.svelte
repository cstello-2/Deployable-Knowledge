<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Upload from '@lucide/svelte/icons/upload';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		findOpen?: boolean;
		importing?: boolean;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onImport: () => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onToggleFind?: () => void;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		view: NotebookView;
	}

	let {
		findOpen = false,
		importing = false,
		onClearSources,
		onCreate,
		onImport,
		onInsertCitation,
		onRemoveSource,
		onToggleFind = () => {},
		sources,
		sourcesLoading = false,
		view
	}: Props = $props();
</script>

<div class="flex items-center gap-1">
	{#if view === 'notebooks' || view === 'pages'}
		<ActionIcon
			class="size-8"
			label={view === 'notebooks' ? 'Create notebook' : 'Create page'}
			onclick={onCreate}
			variant="ghost"><Plus /></ActionIcon
		>
		<ActionIcon
			class="size-8"
			disabled={importing}
			label={view === 'notebooks' ? 'Import notebook from folder' : 'Import Markdown or text file'}
			onclick={onImport}
			variant="ghost"><Upload /></ActionIcon
		>
	{:else}
		<ActionIcon
			class="size-8"
			label="Find in page (Ctrl+F)"
			onclick={onToggleFind}
			pressed={findOpen}
			variant={findOpen ? 'secondary' : 'ghost'}><Search /></ActionIcon
		>
		<NotebookSourcesPanel
			loading={sourcesLoading}
			{onInsertCitation}
			onClear={onClearSources}
			onRemove={onRemoveSource}
			{sources}
		/>
	{/if}
</div>
