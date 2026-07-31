<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import CheckSquare2 from '@lucide/svelte/icons/square-check-big';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderSync from '@lucide/svelte/icons/folder-sync';
	import Square from '@lucide/svelte/icons/square';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { ApiDocumentDirectoryResponse } from '$lib/types';

	interface Props {
		directory: ApiDocumentDirectoryResponse | null;
		disabled?: boolean;
		loading?: boolean;
		onNavigate: (path: string) => void;
		onOpenChange: (open: boolean) => void;
		onSelectedPathsChange: (paths: string[]) => void;
		onSubmitPaths: (paths: string[]) => void;
		onSyncFolder: (path: string) => void;
		open: boolean;
		selectedPaths: string[];
	}

	let {
		directory,
		disabled = false,
		loading = false,
		onNavigate,
		onOpenChange,
		onSelectedPathsChange,
		onSubmitPaths,
		onSyncFolder,
		open,
		selectedPaths
	}: Props = $props();
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
				class="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 border-b border-border/70 pb-2"
			>
				<ActionIcon
					class="size-8 rounded-lg"
					disabled={disabled || loading || !directory?.parentPath}
					label="Parent folder"
					onclick={() => directory?.parentPath && onNavigate(directory.parentPath)}
					variant="ghost"
				>
					<ArrowLeft />
				</ActionIcon>
				<div class="flex h-8 min-w-0 items-center gap-2 px-1">
					<Folder class="size-4 shrink-0 text-muted-foreground" />
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
						{directory?.path ?? 'Loading home folder…'}
					</span>
				</div>
			</div>

			<ScrollArea
				aria-busy={loading}
				class="h-[26rem] rounded-lg border bg-background"
				scrollbarYClasses="hidden"
			>
				<div class="grid divide-y divide-border/70">
					{#if loading}
						<p class="p-4 text-sm text-muted-foreground">Loading folder…</p>
					{:else}
						{#each directory?.items ?? [] as item (item.path)}
							{#if item.kind === 'folder'}
								<button
									class="flex min-h-10 min-w-0 items-center gap-3 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:bg-muted focus-visible:outline-none"
									{disabled}
									onclick={() => onNavigate(item.path)}
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
									onclick={() =>
										onSelectedPathsChange(
											selectedPaths.includes(item.path)
												? selectedPaths.filter((path) => path !== item.path)
												: [...selectedPaths, item.path]
										)}
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
					disabled={disabled || loading || !directory}
					onclick={() => directory && onSyncFolder(directory.path)}
				>
					<FolderSync /> Sync this folder
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
