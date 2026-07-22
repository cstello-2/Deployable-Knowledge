<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Files from '@lucide/svelte/icons/files';
	import FolderSync from '@lucide/svelte/icons/folder-sync';
	import FolderX from '@lucide/svelte/icons/folder-x';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { SvelteSet } from 'svelte/reactivity';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { cn } from '$lib/components/ui/utils';
	import type { ApiSyncedFolder, DocumentRow } from '$lib/types';
	import DocumentListItem from './DocumentListItem.svelte';

	interface DocumentGroup {
		documents: DocumentRow[];
		folder: ApiSyncedFolder | null;
		key: string;
		label: string;
	}

	interface Props {
		busy?: boolean;
		documents: DocumentRow[];
		folders: ApiSyncedFolder[];
		onCreateTag: (document: DocumentRow, tag: string) => Promise<void> | void;
		onDeleteDocument: (document: DocumentRow) => void;
		onRemoveFolder: (folder: ApiSyncedFolder, removeDocuments: boolean) => void;
		onSyncFolder: (folder: ApiSyncedFolder) => void;
		onToggle: (id: string, selected: boolean) => void;
		onToggleActive: (document: DocumentRow) => void;
		onToggleGroup: (ids: string[], selected: boolean) => void;
		onToggleTag: (document: DocumentRow, tag: string) => void;
		selectedIds: ReadonlySet<string>;
		tags: string[];
	}

	let {
		busy = false,
		documents,
		folders,
		onCreateTag,
		onDeleteDocument,
		onRemoveFolder,
		onSyncFolder,
		onToggle,
		onToggleActive,
		onToggleGroup,
		onToggleTag,
		selectedIds,
		tags
	}: Props = $props();
	const collapsed = new SvelteSet<string>();

	const groups = $derived.by(() => {
		const registeredIds = new Set(folders.map(({ id }) => id));
		const values: DocumentGroup[] = folders.map((folder) => ({
			key: folder.id,
			label:
				folder.path
					.split(/[\\/]+/)
					.filter(Boolean)
					.at(-1) || folder.path,
			documents: documents.filter((document) => document.folderId === folder.id),
			folder
		}));
		const individual = documents.filter(
			(document) => !document.folderId || !registeredIds.has(document.folderId)
		);
		if (individual.length) {
			values.push({
				key: 'individual',
				label: 'Individual files',
				documents: individual,
				folder: null
			});
		}
		return values;
	});

	function toggleCollapsed(key: string): void {
		if (!collapsed.delete(key)) collapsed.add(key);
	}
</script>

<ScrollArea aria-live="polite" class="min-h-0" scrollbarYClasses="hidden">
	<div class="grid content-start gap-2">
		{#each groups as group (group.key)}
			<section class="dk-panel overflow-hidden rounded-lg border shadow-sm">
				<header
					class="flex min-w-0 items-center gap-1.5 bg-muted/20 px-2 py-1.5"
					class:border-b={!collapsed.has(group.key) || Boolean(group.folder?.lastError)}
				>
					<Checkbox
						aria-label={`Select every document in ${group.label}`}
						checked={group.documents.length > 0 &&
							group.documents.every((document) => selectedIds.has(document.id))}
						disabled={!group.documents.length}
						indeterminate={group.documents.some((document) => selectedIds.has(document.id)) &&
							!group.documents.every((document) => selectedIds.has(document.id))}
						onCheckedChange={(selected) =>
							onToggleGroup(
								group.documents.map(({ id }) => id),
								selected
							)}
					/>
					{#if group.folder}
						<FolderSync class="size-4 shrink-0 text-muted-foreground" />
					{:else}
						<Files class="size-4 shrink-0 text-muted-foreground" />
					{/if}
					<div class="flex min-w-0 flex-1 items-baseline gap-2">
						<div class="truncate text-sm font-semibold" title={group.folder?.path ?? group.label}>
							{group.label}
						</div>
						<div class="shrink-0 text-[11px] text-muted-foreground">
							{group.documents.length} document{group.documents.length === 1 ? '' : 's'}
							{#if group.folder}
								· {group.folder.watching ? 'watching' : 'stopped'}{/if}
						</div>
					</div>
					{#if group.folder}
						<ActionIcon
							class="border-0 bg-transparent shadow-none"
							disabled={busy}
							label={`Sync ${group.label} now`}
							size="icon-sm"
							variant="ghost"
							onclick={() => onSyncFolder(group.folder!)}
						>
							<RefreshCw />
						</ActionIcon>
						<ActionIcon
							class="border-0 bg-transparent shadow-none"
							disabled={busy}
							label={`Stop watching ${group.label}`}
							size="icon-sm"
							variant="ghost"
							onclick={() => onRemoveFolder(group.folder!, false)}
						>
							<FolderX />
						</ActionIcon>
						<ActionIcon
							class="border-0 bg-transparent shadow-none hover:text-destructive"
							disabled={busy}
							label={`Remove ${group.label} and its documents`}
							size="icon-sm"
							variant="ghost"
							onclick={() => onRemoveFolder(group.folder!, true)}
						>
							<Trash2 />
						</ActionIcon>
					{/if}
					<ActionIcon
						class={cn(
							'size-7 border-0 bg-transparent shadow-none',
							!collapsed.has(group.key) && '[&_svg]:rotate-180'
						)}
						label={`${collapsed.has(group.key) ? 'Expand' : 'Collapse'} ${group.label}`}
						size="icon-sm"
						variant="ghost"
						onclick={() => toggleCollapsed(group.key)}
					>
						<ChevronDown class="transition-transform" />
					</ActionIcon>
				</header>
				{#if group.folder?.lastError}
					<p class="border-b px-2 py-1.5 text-xs text-destructive">{group.folder.lastError}</p>
				{/if}
				{#if !collapsed.has(group.key)}
					<div class="grid divide-y divide-border/70">
						{#each group.documents as document (document.id)}
							<DocumentListItem
								{busy}
								{document}
								{tags}
								onCreateTag={(tag) => onCreateTag(document, tag)}
								onDelete={() => onDeleteDocument(document)}
								onToggle={(selected) => onToggle(document.id, selected)}
								onToggleActive={() => onToggleActive(document)}
								onToggleTag={(tag) => onToggleTag(document, tag)}
								selected={selectedIds.has(document.id)}
							/>
						{:else}
							<p class="px-2 py-3 text-xs text-muted-foreground">No matching documents.</p>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No documents</Empty.Title>
					<Empty.Description>No documents match the current filters.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</div>
</ScrollArea>
