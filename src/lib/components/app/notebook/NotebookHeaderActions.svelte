<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import Download from '@lucide/svelte/icons/download';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		exporting?: boolean;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onExport: () => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onTogglePreview: () => void;
		previewMode?: boolean;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		view: NotebookView;
	}

	let {
		exporting = false,
		onClearSources,
		onCreate,
		onExport,
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
			variant="ghost"
			class="size-8"
			label={view === 'notebooks' ? 'Create notebook' : 'Create page'}
			onclick={onCreate}><Plus /></ActionIcon
		>
	{:else}
		<NotebookSourcesPanel
			{sources}
			loading={sourcesLoading}
			onRemove={onRemoveSource}
			onClear={onClearSources}
		/>
		<ActionIcon
			variant={previewMode ? 'secondary' : 'ghost'}
			class="size-8"
			label={previewMode ? 'Edit notes' : 'Preview Markdown'}
			pressed={previewMode}
			onclick={onTogglePreview}
		>
			{#if previewMode}<Pencil />{:else}<Eye />{/if}
		</ActionIcon>
	{/if}
	{#if view !== 'notebooks'}
		<ActionIcon
			class="size-8"
			disabled={exporting}
			label={exporting ? 'Exporting notebook' : 'Export notebook as Markdown'}
			onclick={onExport}
			variant="ghost"><Download /></ActionIcon
		>
	{/if}
</div>
