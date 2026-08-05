<script lang="ts">
	import FileStack from '@lucide/svelte/icons/files';
	import Quote from '@lucide/svelte/icons/quote';
	import X from '@lucide/svelte/icons/x';
	import { SvelteSet } from 'svelte/reactivity';
	import { ActionIcon } from '$lib/components/app/actions';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/components/ui/utils';
	import type { NotebookSourceItem } from '$lib/types';

	interface Props {
		loading?: boolean;
		onClear: () => Promise<void> | void;
		onRemove: (id: string) => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		sources: readonly NotebookSourceItem[];
	}

	let { loading = false, onClear, onInsertCitation, onRemove, sources }: Props = $props();
	let clearOpen = $state(false);
	const expandedIds = new SvelteSet<string>();

	function toggleExpanded(id: string): void {
		if (!expandedIds.delete(id)) expandedIds.add(id);
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<ActionIcon
				class="relative size-8"
				label="View loaded sources"
				triggerProps={props}
				variant="ghost"
			>
				<FileStack />
				{#if sources.length}<Badge class="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[0.6rem]"
						>{sources.length}</Badge
					>{/if}
			</ActionIcon>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-96 max-w-[calc(100vw-2rem)] p-0">
		<header class="flex items-center justify-between gap-2 border-b p-3">
			<strong class="text-sm">Loaded sources ({sources.length})</strong>
			<Button
				variant="destructive"
				size="sm"
				disabled={!sources.length}
				onclick={() => (clearOpen = true)}>Clear all</Button
			>
		</header>
		<div class="grid min-w-0 max-h-80 content-start gap-2 overflow-x-hidden overflow-y-auto p-3">
			{#if loading}
				<Skeleton class="h-20" /><Skeleton class="h-20" />
			{:else}
				{#each sources as source (source.id)}
					<article class="dk-panel relative grid min-w-0 gap-1 rounded-xl border p-3 pr-9">
						<ActionIcon
							size="icon-sm"
							class="absolute top-2 right-2"
							label="Remove source"
							onclick={() => onRemove(source.id)}><X /></ActionIcon
						>
						<div class="flex min-w-0 items-center gap-2 text-xs">
							<strong class="min-w-0 flex-1 truncate">{source.documentTitle}</strong><span
								class="shrink-0 text-muted-foreground">Page {source.pageIndex + 1}</span
							>
						</div>
						<p
							class={cn(
								'm-0 min-w-0 text-xs text-muted-foreground',
								expandedIds.has(source.id)
									? 'max-h-48 overflow-y-auto whitespace-pre-wrap break-words'
									: 'line-clamp-3 break-words'
							)}
						>
							{expandedIds.has(source.id) ? source.content : source.preview}
						</p>
						<div class="mt-1 flex min-w-0 items-center gap-2">
							<Button
								class="h-auto justify-self-start px-1.5 py-0.5 text-xs"
								onclick={() => toggleExpanded(source.id)}
								size="sm"
								variant="ghost"
							>
								{expandedIds.has(source.id) ? 'Show less' : 'Show full chunk'}
							</Button>
							<Button
								class="justify-self-start"
								size="sm"
								variant="outline"
								onclick={() => onInsertCitation(source)}
							>
								<Quote /> Insert citation
							</Button>
						</div>
					</article>
				{:else}
					<p class="text-sm text-muted-foreground">
						No sources loaded yet. Send an assistant reply to this notebook to attach its source
						chunks.
					</p>
				{/each}
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>

<DialogConfirmation
	open={clearOpen}
	title="Clear notebook sources?"
	description="Remove every source attached to this notebook? The page text will remain."
	confirmLabel="Clear sources"
	onOpenChange={(open) => (clearOpen = open)}
	onConfirm={onClear}
/>
