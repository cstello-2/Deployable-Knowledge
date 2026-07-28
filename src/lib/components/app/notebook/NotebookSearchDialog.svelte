<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookWithPages } from '$lib/types';
	import { searchNotebookPages, type NotebookSearchResult } from '$lib/utils/notebook-search';

	interface Props {
		notebooks: readonly NotebookWithPages[];
		onOpenResult: (result: NotebookSearchResult) => Promise<void> | void;
		onOpenChange: (open: boolean) => void;
		open: boolean;
	}

	let { notebooks, onOpenResult, onOpenChange, open }: Props = $props();
	let query = $state('');
	const results = $derived(searchNotebookPages(notebooks, query));

	$effect(() => {
		if (!open) query = '';
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Search notebook pages</Dialog.Title>
			<Dialog.Description>
				Find keywords in page text, page titles, and notebook titles.
			</Dialog.Description>
		</Dialog.Header>
		<div class="relative">
			<Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" />
			<Input
				class="pl-9"
				bind:value={query}
				type="search"
				placeholder="Search all notebooks..."
				autofocus
			/>
		</div>
		<p class="text-xs text-muted-foreground" role="status">
			{query.trim()
				? `${results.length} matching ${results.length === 1 ? 'page' : 'pages'}`
				: `Search across ${notebooks.length} ${notebooks.length === 1 ? 'notebook' : 'notebooks'}`}
		</p>
		<ScrollArea class="max-h-80 min-h-36">
			<div class="grid gap-2 pr-3">
				{#if !query.trim()}
					<p class="py-8 text-center text-sm text-muted-foreground">
						Enter one or more keywords. Every keyword must appear in the result.
					</p>
				{:else if !results.length}
					<p class="py-8 text-center text-sm text-muted-foreground">No notebook pages match.</p>
				{:else}
					{#each results as result (result.pageId)}
						<Button
							class="h-auto justify-start whitespace-normal p-3 text-left"
							variant="outline"
							onclick={() => onOpenResult(result)}
						>
							<span class="grid gap-1">
								<strong>{result.notebookTitle} → {result.pageTitle}</strong>
								<span class="text-xs font-normal text-muted-foreground">{result.snippet}</span>
								<small class="text-primary"
									>{result.matchCount} text {result.matchCount === 1 ? 'match' : 'matches'}</small
								>
							</span>
						</Button>
					{/each}
				{/if}
			</div>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
