<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ClipboardPen from '@lucide/svelte/icons/clipboard-pen';
	import Files from '@lucide/svelte/icons/files';
	import FolderSync from '@lucide/svelte/icons/folder-sync';
	import FolderX from '@lucide/svelte/icons/folder-x';
	import Plug from '@lucide/svelte/icons/plug';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import { SvelteSet } from 'svelte/reactivity';
	import { infiniteScroll } from '$lib/actions';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { FolderSyncStatus } from '$lib/client/folder-sync/sync-engine.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { cn } from '$lib/components/ui/utils';
	import { LOOSE_DOCUMENT_GROUPS, type LooseDocumentGroup } from '$lib/constants';
	import type { ApiDocumentListResponse, ApiSyncedFolder, DocumentRow } from '$lib/types';
	import DocumentListItem from './DocumentListItem.svelte';

	const SYNC_STATUS_LABELS: Record<FolderSyncStatus, string> = {
		unsupported: 'not supported here',
		'handle-missing': 'reconnect needed',
		'permission-needed': 'reconnect needed',
		syncing: 'syncing',
		watching: 'watching',
		idle: 'synced',
		error: 'sync error'
	};

	const LOOSE_GROUP_LABELS: Record<LooseDocumentGroup, string> = {
		individual: 'Individual files',
		manual: 'Manually Loaded'
	};

	interface DocumentGroup {
		documents: DocumentRow[];
		folder: ApiSyncedFolder | null;
		key: string;
		kind: 'folder' | LooseDocumentGroup;
		label: string;
		total: number;
	}

	interface Props {
		busy?: boolean;
		folders: ApiSyncedFolder[];
		loadingGroups: ReadonlySet<string>;
		onAutotagDocument: (document: DocumentRow) => void;
		onAutotagGroup: (group: string) => void;
		onCreateTag: (document: DocumentRow, tag: string) => Promise<void> | void;
		onDeleteDocument: (document: DocumentRow) => void;
		onLoadMore: (group: string) => void;
		onReconnectFolder?: (folder: ApiSyncedFolder) => void;
		onRemoveFolder: (folder: ApiSyncedFolder, removeDocuments: boolean) => void;
		onRetryFolder?: (folder: ApiSyncedFolder) => void;
		onSyncFolder: (folder: ApiSyncedFolder) => void;
		syncStatuses?: ReadonlyMap<string, FolderSyncStatus>;
		onToggle: (id: string, selected: boolean) => void;
		onToggleActive: (document: DocumentRow) => void;
		onToggleGroup: (group: string, selected: boolean) => void;
		onToggleTag: (document: DocumentRow, tag: string) => void;
		pages: Record<string, ApiDocumentListResponse>;
		selectedIds: ReadonlySet<string>;
		tags: string[];
	}

	let {
		busy = false,
		folders,
		loadingGroups,
		onAutotagDocument,
		onAutotagGroup,
		onCreateTag,
		onDeleteDocument,
		onLoadMore,
		onReconnectFolder = () => {},
		onRemoveFolder,
		onRetryFolder = () => {},
		onSyncFolder,
		syncStatuses = new Map(),
		onToggle,
		onToggleActive,
		onToggleGroup,
		onToggleTag,
		pages,
		selectedIds,
		tags
	}: Props = $props();
	const collapsed = new SvelteSet<string>();
	let viewport = $state<HTMLDivElement | null>(null);

	const groups = $derived.by(() => {
		const values: DocumentGroup[] = folders.map((folder) => ({
			key: folder.id,
			kind: 'folder' as const,
			label: folder.name,
			documents: pages[folder.id]?.documents ?? [],
			folder,
			total: pages[folder.id]?.total ?? 0
		}));
		for (const kind of LOOSE_DOCUMENT_GROUPS) {
			const page = pages[kind];
			if (!page?.total) continue;
			values.push({
				key: kind,
				kind,
				label: LOOSE_GROUP_LABELS[kind],
				documents: page.documents,
				folder: null,
				total: page.total
			});
		}
		return values;
	});

	function toggleCollapsed(key: string): void {
		if (!collapsed.delete(key)) collapsed.add(key);
	}
</script>

<ScrollArea
	aria-live="polite"
	bind:viewportRef={viewport}
	class="min-h-0"
	scrollbarYClasses="hidden"
>
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
						disabled={!group.documents.length && !group.total}
						indeterminate={group.documents.some((document) => selectedIds.has(document.id)) &&
							!group.documents.every((document) => selectedIds.has(document.id))}
						onCheckedChange={(selected) => onToggleGroup(group.key, selected)}
					/>
					{#if group.folder}
						<FolderSync class="size-4 shrink-0 text-muted-foreground" />
					{:else if group.kind === 'manual'}
						<ClipboardPen class="size-4 shrink-0 text-muted-foreground" />
					{:else}
						<Files class="size-4 shrink-0 text-muted-foreground" />
					{/if}
					<div class="flex min-w-0 flex-1 items-baseline gap-2">
						<div class="truncate text-sm font-semibold" title={group.label}>
							{group.label}
						</div>
						<div class="shrink-0 text-[11px] text-muted-foreground">
							{group.total} document{group.total === 1 ? '' : 's'}
							{#if group.folder && syncStatuses.has(group.folder.id)}
								· {SYNC_STATUS_LABELS[syncStatuses.get(group.folder.id)!]}{/if}
							{#if group.folder && group.folder.malformedCount > 0}
								· <span class="text-destructive">{group.folder.malformedCount} malformed</span>{/if}
						</div>
					</div>
					<ActionIcon
						class="border-0 bg-transparent shadow-none"
						disabled={busy || !group.total}
						label={`Autotag ${group.label}`}
						size="icon-sm"
						variant="ghost"
						onclick={() => onAutotagGroup(group.key)}
					>
						<WandSparkles />
					</ActionIcon>
					{#if group.folder}
						{#if group.folder.malformedCount > 0}
							<ActionIcon
								class="border-0 bg-transparent text-destructive shadow-none"
								disabled={busy}
								label={`Retry ${group.folder.malformedCount} malformed file${group.folder.malformedCount === 1 ? '' : 's'} in ${group.label}`}
								size="icon-sm"
								variant="ghost"
								onclick={() => onRetryFolder(group.folder!)}
							>
								<RotateCcw />
							</ActionIcon>
						{/if}
						{#if syncStatuses.get(group.folder.id) === 'handle-missing' || syncStatuses.get(group.folder.id) === 'permission-needed'}
							<ActionIcon
								class="border-0 bg-transparent shadow-none"
								disabled={busy}
								label={`Reconnect ${group.label}`}
								size="icon-sm"
								variant="ghost"
								onclick={() => onReconnectFolder(group.folder!)}
							>
								<Plug />
							</ActionIcon>
						{/if}
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
								onAutotag={() => onAutotagDocument(document)}
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
					{#if group.documents.length < group.total}
						<div
							aria-hidden="true"
							use:infiniteScroll={{
								disabled: busy || loadingGroups.has(group.key),
								onLoadMore: () => onLoadMore(group.key),
								root: viewport
							}}
						></div>
						<p class="border-t px-2 py-1.5 text-center text-xs text-muted-foreground">
							{loadingGroups.has(group.key)
								? 'Loading more documents…'
								: `Showing ${group.documents.length} of ${group.total} documents`}
						</p>
					{/if}
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
