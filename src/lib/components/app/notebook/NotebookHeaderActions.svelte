<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Upload from '@lucide/svelte/icons/upload';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		importing?: boolean;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onImport: () => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onToggleSearch: () => void;
		onTogglePreview: () => void;
		previewMode?: boolean;
		searchOpen?: boolean;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		view: NotebookView;
	}

	let {
		importing = false,
		onClearSources,
		onCreate,
		onImport,
		onInsertCitation,
		onRemoveSource,
		onToggleSearch,
		onTogglePreview,
		previewMode = false,
		searchOpen = false,
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
		<NotebookSourcesPanel
			loading={sourcesLoading}
			{onInsertCitation}
			onClear={onClearSources}
			onRemove={onRemoveSource}
			{sources}
		/>
		<ActionIcon
			class="size-8"
			label="Search this page"
			onclick={onToggleSearch}
			pressed={searchOpen}
			variant={searchOpen ? 'secondary' : 'ghost'}
		>
			<Search />
		</ActionIcon>
		<ActionIcon
			class="size-8"
			label={previewMode ? 'Edit notes' : 'Preview Markdown'}
			onclick={onTogglePreview}
			pressed={previewMode}
			variant={previewMode ? 'secondary' : 'ghost'}
		>
			{#if previewMode}<Pencil />{:else}<Eye />{/if}
		</ActionIcon>
	{/if}
</div>
