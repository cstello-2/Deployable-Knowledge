<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { NotebookSourceItem } from '$lib/types';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onTogglePreview: () => void;
		previewMode?: boolean;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		view: NotebookView;
	}

	let {
		onClearSources,
		onCreate,
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
			variant="ghost"
			onclick={onCreate}><Plus /></ActionIcon
		>
	{:else}
		<NotebookSourcesPanel
			loading={sourcesLoading}
			{sources}
			onClear={onClearSources}
			onRemove={onRemoveSource}
		/>
		<ActionIcon
			class="size-8"
			label={previewMode ? 'Edit notes' : 'Preview Markdown'}
			pressed={previewMode}
			variant={previewMode ? 'secondary' : 'ghost'}
			onclick={onTogglePreview}
		>
			{#if previewMode}<Pencil />{:else}<Eye />{/if}
		</ActionIcon>
	{/if}
</div>
