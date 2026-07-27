<script lang="ts">
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { RetrievalMode } from '$lib/enums';
	import { SearchService } from '$lib/services';
	import { documentsStore, settingsStore } from '$lib/stores';
	import type { ApiSearchResults } from '$lib/types';
	import SearchForm from './SearchForm.svelte';
	import SearchResultCard from './SearchResultCard.svelte';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onToggleCollapse = () => {},
		onClose = () => {}
	}: Props = $props();

	let query = $state(settingsStore.lastQuery);
	let retrievalMode = $state<RetrievalMode>(settingsStore.config.retrievalMode);
	let ragTopK = $state(settingsStore.config.ragTopK);
	let results = $state<ApiSearchResults>({ semantic: [], bm25: [], hybrid: [] });
	let loading = $state(false);
	let error = $state('');
	const activeResults = $derived(results[retrievalMode] ?? []);

	async function runSearch(): Promise<void> {
		const value = query.trim();

		if (!value) {
			results = { semantic: [], bm25: [], hybrid: [] };
			return;
		}

		loading = true;
		error = '';
		settingsStore.lastQuery = value;

		try {
			results = await SearchService.search(
				value,
				Math.max(1, Math.floor(ragTopK || settingsStore.config.ragTopK)),
				[...documentsStore.selectedIds]
			);
		} catch (searchError) {
			error = searchError instanceof Error ? searchError.message : 'Search failed';
			results = { semantic: [], bm25: [], hybrid: [] };
		} finally {
			loading = false;
		}
	}
</script>

<WorkspaceWindow
	{id}
	{title}
	{closable}
	{height}
	{collapsed}
	{onToggleCollapse}
	{onClose}
	contentLabel="Search context"
>
	<div class="grid min-h-full grid-rows-[auto_1fr] gap-3">
		<SearchForm bind:query bind:ragTopK bind:retrievalMode {loading} onSubmit={runSearch} />
		<ScrollArea class="min-h-0" scrollbarYClasses="hidden" aria-live="polite">
			<div class="grid content-start gap-2">
				{#if error}
					<p
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{error}
					</p>
				{:else if loading}
					<Skeleton class="h-28" /><Skeleton class="h-28" />
				{:else}
					{#each activeResults as result, index (result.chunkId)}
						<SearchResultCard {result} {index} />
					{:else}
						<Empty.Root>
							<Empty.Header
								><Empty.Title>No context</Empty.Title><Empty.Description
									>Run a search to inspect matching chunks.</Empty.Description
								></Empty.Header
							>
						</Empty.Root>
					{/each}
				{/if}
			</div>
		</ScrollArea>
	</div>
</WorkspaceWindow>
