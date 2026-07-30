<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CheckSquare2 from '@lucide/svelte/icons/square-check-big';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderInput from '@lucide/svelte/icons/folder-input';
	import Square from '@lucide/svelte/icons/square';
	import Upload from '@lucide/svelte/icons/upload';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { ApiDocumentDirectoryResponse } from '$lib/types';
	import type { NotebookImportMode } from './notebook-types';

	interface Props {
		directory: ApiDocumentDirectoryResponse | null;
		disabled?: boolean;
		loading?: boolean;
		mode: NotebookImportMode;
		onImportFolder: (path: string) => void;
		onNavigate: (path: string) => void;
		onOpenChange: (open: boolean) => void;
		onSelectedPathsChange: (paths: string[]) => void;
		onSubmitPaths: (paths: string[]) => void;
		open: boolean;
		selectedPaths: string[];
	}

	let {
		directory,
		disabled = false,
		loading = false,
		mode,
		onImportFolder,
		onNavigate,
		onOpenChange,
		onSelectedPathsChange,
		onSubmitPaths,
		open,
		selectedPaths
	}: Props = $props();

	const items = $derived(
		(directory?.items ?? []).filter((item) => {
			if (item.kind === 'folder') return true;
			if (mode === 'collection') return false;
			return item.kind === 'markdown' || item.kind === 'text';
		})
	);

	function togglePath(path: string): void {
		onSelectedPathsChange(
			selectedPaths.includes(path)
				? selectedPaths.filter((selectedPath) => selectedPath !== path)
				: [...selectedPaths, path]
		);
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="overflow-hidden sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>
				{mode === 'collection' ? 'Import notebook collection' : 'Import notebook pages'}
			</Dialog.Title>
			<Dialog.Description>
				{mode === 'collection'
					? 'Navigate to the folder you want to import as a new notebook.'
					: 'Choose one or more Markdown or text files to add to the active notebook.'}
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
						{#each items as item (item.path)}
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
									onclick={() => togglePath(item.path)}
									type="button"
								>
									{#if selectedPaths.includes(item.path)}
										<CheckSquare2 class="size-4 shrink-0 text-primary" />
									{:else}
										<Square class="size-4 shrink-0" />
									{/if}

									<FileText class="size-4 shrink-0" />

									<span class="truncate">{item.name}</span>
								</button>
							{/if}
						{:else}
							<p class="p-4 text-sm text-muted-foreground">
								{mode === 'collection' ? 'No folders here.' : 'No Markdown or text files here.'}
							</p>
						{/each}
					{/if}
				</div>
			</ScrollArea>
		</div>

		<Dialog.Footer>
			{#if mode === 'collection'}
				<span class="mr-auto text-xs text-muted-foreground">
					Import the current folder as a new notebook
				</span>

				<Button onclick={() => onOpenChange(false)} variant="outline">Cancel</Button>

				<Button
					disabled={disabled || loading || !directory}
					onclick={() => directory && onImportFolder(directory.path)}
				>
					<FolderInput />
					Import this folder
				</Button>
			{:else}
				<span class="mr-auto text-xs text-muted-foreground">
					{#if selectedPaths.length}
						{selectedPaths.length} selected
					{:else}
						No pages selected
					{/if}
				</span>

				<Button onclick={() => onOpenChange(false)} variant="outline">Cancel</Button>

				<Button
					disabled={disabled || loading || !selectedPaths.length}
					onclick={() => onSubmitPaths(selectedPaths)}
				>
					<Upload />
					Import {selectedPaths.length}
					{selectedPaths.length === 1 ? 'page' : 'pages'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
