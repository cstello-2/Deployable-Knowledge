<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import Download from '@lucide/svelte/icons/download';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Upload from '@lucide/svelte/icons/upload';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		exporting?: boolean;
		importing?: boolean;
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
		view: NotebookView;
	}

	let {
		exporting = false,
		importing = false,
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
			label={importing
				? 'Importing notebook content'
				: view === 'notebooks'
					? 'Import notebook from folder or ZIP'
					: 'Import Markdown or text pages'}
			onclick={onImport}
			variant="ghost"><Upload /></ActionIcon
		>
		<ActionIcon
			class="size-8"
			disabled={exporting}
			label={exporting
				? view === 'notebooks'
					? 'Exporting notebook'
					: 'Exporting page'
				: view === 'notebooks'
					? 'Export notebook as ZIP'
					: 'Export page as Markdown'}
			onclick={onExport}
			variant="ghost"><Download /></ActionIcon
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
			label={previewMode ? 'Edit notes' : 'Preview Markdown'}
			onclick={onTogglePreview}
			pressed={previewMode}
			variant={previewMode ? 'secondary' : 'ghost'}
		>
			{#if previewMode}<Pencil />{:else}<Eye />{/if}
		</ActionIcon>
	{/if}
</div>
