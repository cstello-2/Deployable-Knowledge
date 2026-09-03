<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { documentViewerHref } from '$lib/constants';
	import { RetrievalMode } from '$lib/enums';
	import { SearchService } from '$lib/services';
	import { chunkRatingsStore, documentsStore, notebooksStore, settingsStore } from '$lib/stores';
	import type { ApiSearchMatch, ApiSearchResults, ChunkRatingValue } from '$lib/types';
	import { describeDocumentLocation } from '$lib/utils';
	import { notebookSourceHeading } from '$lib/utils/notebook-citations';
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
	let results = $state<ApiSearchResults>({
		semantic: [],
		bm25: [],
		hybrid: []
	});
	let resultQuery = $state('');
	let loading = $state(false);
	let error = $state('');

	const activeResults = $derived(results[retrievalMode] ?? []);

	async function runSearch(): Promise<void> {
		const value = query.trim();

		if (!value) {
			results = { semantic: [], bm25: [], hybrid: [] };
			resultQuery = '';
			return;
		}

		loading = true;
		error = '';
		settingsStore.lastQuery = value;

		try {
			const searchResults = await SearchService.search(
				value,
				Math.max(1, Math.floor(ragTopK || settingsStore.config.ragTopK)),
				[...documentsStore.selectedIds]
			);
			results = searchResults;
			resultQuery = value;
			chunkRatingsStore.hydrate(value, searchResults);
		} catch (searchError) {
			error = searchError instanceof Error ? searchError.message : 'Search failed';
			results = { semantic: [], bm25: [], hybrid: [] };
			resultQuery = '';
		} finally {
			loading = false;
		}
	}

	async function rateChunk(
		result: ApiSearchMatch,
		index: number,
		rating: ChunkRatingValue | null
	): Promise<void> {
		if (!resultQuery) return;

		try {
			await chunkRatingsStore.update({
				chunkId: result.chunkId,
				query: resultQuery,
				rating,
				retrievalMode,
				resultRank: index + 1
			});
		} catch (ratingError) {
			toast.error(ratingError instanceof Error ? ratingError.message : 'Failed to save rating');
		}
	}

	async function saveChunk(chunkId: string): Promise<void> {
		try {
			const notebookTitle = await notebooksStore.saveChunk(chunkId);
			toast.success(`Chunk saved to Loaded Sources in ${notebookTitle}`);
		} catch (saveError) {
			toast.error(saveError instanceof Error ? saveError.message : 'Failed to save chunk');
		}
	}

	async function sendToNotebook(result: ApiSearchMatch): Promise<void> {
		try {
			await notebooksStore.load();
			const heading = notebookSourceHeading(
				result.sourceTitle,
				documentViewerHref(result.sourceType, result.documentId, result),
				describeDocumentLocation(result.sourceType, result.pageIndex)
			);
			await notebooksStore.appendToActivePage(`${heading}\n\n${result.content}`);
			await notebooksStore.addSources([result.chunkId]);
			toast.success('Chunk sent to notebook');
		} catch (sendError) {
			toast.error(sendError instanceof Error ? sendError.message : 'Failed to send to notebook');
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

		<ScrollArea aria-live="polite" class="min-h-0" scrollbarYClasses="hidden">
			<div class="grid content-start gap-2">
				{#if error}
					<p
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{error}
					</p>
				{:else if loading}
					<Skeleton class="h-28" />
					<Skeleton class="h-28" />
				{:else}
					{#each activeResults as result, index (result.chunkId)}
						<SearchResultCard
							{index}
							onRatingChange={(rating) => void rateChunk(result, index, rating)}
							onSaveChunk={(chunkId) => void saveChunk(chunkId)}
							onSendToNotebook={(match) => void sendToNotebook(match)}
							rating={chunkRatingsStore.ratingFor(resultQuery, result.chunkId)}
							ratingSaving={chunkRatingsStore.isSaving(resultQuery, result.chunkId)}
							{result}
						/>
					{:else}
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>No context</Empty.Title>
								<Empty.Description>Run a search to inspect matching chunks.</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/each}
				{/if}
			</div>
		</ScrollArea>
	</div>
</WorkspaceWindow>
