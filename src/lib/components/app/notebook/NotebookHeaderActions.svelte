<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Upload from '@lucide/svelte/icons/upload';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { NotebookSourceItem } from '$lib/types';
	import { FOLDER_IMPORT_UNSUPPORTED_MESSAGE } from '$lib/utils';
	import { NotebookSourcesPanel } from './NotebookSourcesPanel';
	import type { NotebookView } from './notebook-types';

	interface Props {
		collectionImportSupported?: boolean;
		findOpen?: boolean;
		importing?: boolean;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onImport: () => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		onInsertCitationsTable: () => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onToggleFind?: () => void;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		view: NotebookView;
	}

	let {
		collectionImportSupported = true,
		findOpen = false,
		importing = false,
		onClearSources,
		onCreate,
		onImport,
		onInsertCitation,
		onInsertCitationsTable,
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
		{#if view === 'notebooks' && !collectionImportSupported}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<span {...props}>
							<ActionIcon
								class="size-8"
								disabled
								label="Import notebook from folder"
								variant="ghost"><Upload /></ActionIcon
							>
						</span>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{FOLDER_IMPORT_UNSUPPORTED_MESSAGE}</Tooltip.Content>
			</Tooltip.Root>
		{:else}
			<ActionIcon
				class="size-8"
				disabled={importing}
				label={view === 'notebooks'
					? 'Import notebook from folder'
					: 'Import Markdown or text file'}
				onclick={onImport}
				variant="ghost"><Upload /></ActionIcon
			>
		{/if}
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
			onClear={onClearSources}
			{onInsertCitation}
			{onInsertCitationsTable}
			onRemove={onRemoveSource}
			{sources}
		/>
	{/if}
</div>
