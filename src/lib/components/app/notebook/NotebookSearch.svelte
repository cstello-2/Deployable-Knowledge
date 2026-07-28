<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { NotebookWithPages } from '$lib/types';
	import { searchNotebookPages, type NotebookSearchResult } from './notebook-search';

	interface Props {
		children: Snippet;
		notebooks: readonly NotebookWithPages[];
		onOpenResult: (result: NotebookSearchResult) => Promise<void> | void;
		placeholder: string;
	}

	let { children, notebooks, onOpenResult, placeholder }: Props = $props();
	let query = $state('');

	const searching = $derived(Boolean(query.trim()));
	const results = $derived(searchNotebookPages(notebooks, query));
</script>

<div class="grid min-h-0 grid-rows-[auto_1fr]">
	<div class="p-3 pb-0">
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input bind:value={query} aria-label={placeholder} class="pl-9" {placeholder} type="search" />
		</div>
	</div>
	{#if searching}
		<ScrollArea class="min-h-0" scrollbarYClasses="hidden">
			<div class="grid content-start gap-2 p-3">
				<p class="m-0 text-xs text-muted-foreground" role="status">
					{results.length} matching {results.length === 1 ? 'page' : 'pages'}
				</p>
				{#each results as result (result.pageId)}
					<Button
						class="h-auto justify-start p-3 text-left whitespace-normal"
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
				{:else}
					<Empty.Root class="border border-dashed"
						><Empty.Header
							><Empty.Title>No matches</Empty.Title><Empty.Description
								>Every keyword must appear in the page, its title, or its notebook.</Empty.Description
							></Empty.Header
						></Empty.Root
					>
				{/each}
			</div>
		</ScrollArea>
	{:else}
		{@render children()}
	{/if}
</div>
