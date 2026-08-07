<script lang="ts">
	import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-a-z';
	import ArrowDownZA from '@lucide/svelte/icons/arrow-down-z-a';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import CheckSquare2 from '@lucide/svelte/icons/square-check-big';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderSync from '@lucide/svelte/icons/folder-sync';
	import Square from '@lucide/svelte/icons/square';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { infiniteScroll } from '$lib/actions';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { documentsStore } from '$lib/stores';
	import type { ApiDocumentDirectoryItem, SortDirection } from '$lib/types';

	const PAGE_SIZE = 100;

	interface Props {
		disabled?: boolean;
		onOpenChange: (open: boolean) => void;
		onSubmitPaths: (paths: string[]) => void;
		onSyncFolder: (path: string) => void;
		open: boolean;
	}

	let { disabled = false, onOpenChange, onSubmitPaths, onSyncFolder, open }: Props = $props();

	let directoryPath = $state<string | null>(null);
	let parentPath = $state<string | null>(null);
	let items = $state<ApiDocumentDirectoryItem[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadingMore = $state(false);
	let loadMoreFailed = $state(false);
	let sort = $state<SortDirection>('asc');
	let selectedPaths = $state<string[]>([]);
	let viewport = $state<HTMLDivElement | null>(null);
	let request = 0;

	const hasMore = $derived(items.length < total);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			selectedPaths = [];
			void navigate('');
		});
	});

	async function navigate(path: string): Promise<void> {
		const current = ++request;
		loading = true;
		loadMoreFailed = false;
		try {
			const result = await documentsStore.browseDirectory({
				path,
				sort,
				limit: PAGE_SIZE,
				offset: 0
			});
			if (current !== request) return;
			directoryPath = result.path;
			parentPath = result.parentPath;
			items = result.items;
			total = result.total;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			if (current === request) loading = false;
		}
	}

	async function loadMore(): Promise<void> {
		if (loading || loadingMore || loadMoreFailed || !hasMore || directoryPath === null) return;
		const current = ++request;
		loadingMore = true;
		try {
			const result = await documentsStore.browseDirectory({
				path: directoryPath,
				sort,
				limit: PAGE_SIZE,
				offset: items.length
			});
			if (current !== request) return;
			items = [...items, ...result.items];
			total = result.total;
		} catch (error) {
			loadMoreFailed = true;
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			loadingMore = false;
		}
	}

	function toggleSort(): void {
		sort = sort === 'asc' ? 'desc' : 'asc';
		void navigate(directoryPath ?? '');
	}

	function toggleSelected(path: string): void {
		selectedPaths = selectedPaths.includes(path)
			? selectedPaths.filter((item) => item !== path)
			: [...selectedPaths, path];
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="overflow-hidden sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2"
				><FolderSync /> Add documents or sync a folder</Dialog.Title
			>
			<Dialog.Description>
				Browse local folders; select PDFs or audio files; or keep files in the current folder
				synchronized.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid min-h-0 gap-2">
			<div
				class="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2 border-b border-border/70 pb-2"
			>
				<ActionIcon
					class="size-8 rounded-lg"
					disabled={disabled || loading || !parentPath}
					label="Parent folder"
					onclick={() => parentPath && void navigate(parentPath)}
					variant="ghost"
				>
					<ArrowLeft />
				</ActionIcon>
				<div class="flex h-8 min-w-0 items-center gap-2 px-1">
					<Folder class="size-4 shrink-0 text-muted-foreground" />
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
						{directoryPath ?? 'Loading home folder…'}
					</span>
				</div>
				<ActionIcon
					class="size-8 rounded-lg"
					disabled={disabled || loading}
					label={sort === 'asc' ? 'Sort by name, A to Z' : 'Sort by name, Z to A'}
					onclick={toggleSort}
					variant="ghost"
				>
					{#if sort === 'asc'}<ArrowDownAZ />{:else}<ArrowDownZA />{/if}
				</ActionIcon>
			</div>

			<ScrollArea
				aria-busy={loading}
				bind:viewportRef={viewport}
				class="h-[26rem] rounded-lg border bg-background"
				scrollbarYClasses="hidden"
			>
				<div class="grid divide-y divide-border/70">
					{#if loading}
						<p class="p-4 text-sm text-muted-foreground">Loading folder…</p>
					{:else}
						{#each items as item (item.path)}
							{#if item.kind === 'folder'}
								<button
									class="flex min-h-10 min-w-0 items-center gap-3 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:bg-muted focus-visible:outline-none"
									{disabled}
									onclick={() => void navigate(item.path)}
									type="button"
								>
									<Folder class="size-[18px] shrink-0 text-muted-foreground" />
									<span class="truncate">{item.name}</span>
								</button>
							{:else}
								<button
									aria-pressed={selectedPaths.includes(item.path)}
									class="flex min-h-10 min-w-0 items-center gap-3 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:bg-muted focus-visible:outline-none aria-pressed:bg-primary/10 aria-pressed:text-foreground"
									{disabled}
									onclick={() => toggleSelected(item.path)}
									type="button"
								>
									{#if selectedPaths.includes(item.path)}
										<CheckSquare2 class="size-4 shrink-0 text-primary" />
									{:else}
										<Square class="size-4 shrink-0" />
									{/if}
									{#if item.kind === 'audio'}
										<AudioLines class="size-4 shrink-0" />
									{:else if item.kind === 'xlsx' || item.kind === 'csv'}
										<FileSpreadsheet class="size-4 shrink-0" />
									{:else}
										<FileText class="size-4 shrink-0" />
									{/if}
									<span class="truncate">{item.name}</span>
								</button>
							{/if}
						{:else}
							<p class="p-4 text-sm text-muted-foreground">
								No folders or supported documents here.
							</p>
						{/each}
						{#if hasMore}
							<div
								aria-hidden="true"
								use:infiniteScroll={{
									disabled: disabled || loadingMore || loadMoreFailed,
									onLoadMore: () => void loadMore(),
									root: viewport
								}}
							></div>
							<p class="p-2 text-center text-xs text-muted-foreground">
								{loadingMore ? 'Loading more…' : `Showing ${items.length} of ${total} entries`}
							</p>
						{/if}
					{/if}
				</div>
			</ScrollArea>
		</div>

		<Dialog.Footer>
			<span class="mr-auto text-xs text-muted-foreground">
				{selectedPaths.length
					? `${selectedPaths.length} file${selectedPaths.length === 1 ? '' : 's'} selected`
					: 'No files selected'}
			</span>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
			{#if selectedPaths.length}
				<Button {disabled} onclick={() => onSubmitPaths(selectedPaths)}>
					Add {selectedPaths.length} file{selectedPaths.length === 1 ? '' : 's'}
				</Button>
			{:else}
				<Button
					disabled={disabled || loading || directoryPath === null}
					onclick={() => directoryPath && onSyncFolder(directoryPath)}
				>
					<FolderSync /> Sync this folder
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
