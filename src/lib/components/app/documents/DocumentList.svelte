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
	import { SvelteSet } from 'svelte/reactivity';
	import { infiniteScroll } from '$lib/actions';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { FolderSyncStatus } from '$lib/client/folder-sync/sync-engine.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { cn } from '$lib/components/ui/utils';
	import type { ApiFolderDocumentCount, ApiSyncedFolder, DocumentRow } from '$lib/types';
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

	interface DocumentGroup {
		documents: DocumentRow[];
		folder: ApiSyncedFolder | null;
		key: string;
		kind: 'folder' | 'individual' | 'manual';
		label: string;
		total: number;
	}

	interface Props {
		busy?: boolean;
		documents: DocumentRow[];
		folderCounts?: ApiFolderDocumentCount[];
		folders: ApiSyncedFolder[];
		hasMore?: boolean;
		loadingMore?: boolean;
		onCreateTag: (document: DocumentRow, tag: string) => Promise<void> | void;
		onDeleteDocument: (document: DocumentRow) => void;
		onLoadMore?: () => void;
		manualTotal?: number;
		onReconnectFolder?: (folder: ApiSyncedFolder) => void;
		onRemoveFolder: (folder: ApiSyncedFolder, removeDocuments: boolean) => void;
		onRetryFolder?: (folder: ApiSyncedFolder) => void;
		onSyncFolder: (folder: ApiSyncedFolder) => void;
		syncStatuses?: ReadonlyMap<string, FolderSyncStatus>;
		onToggle: (id: string, selected: boolean) => void;
		onToggleActive: (document: DocumentRow) => void;
		onToggleGroup: (group: string, selected: boolean) => void;
		onToggleTag: (document: DocumentRow, tag: string) => void;
		selectedIds: ReadonlySet<string>;
		tags: string[];
		total?: number;
	}

	let {
		busy = false,
		documents,
		folderCounts = [],
		folders,
		hasMore = false,
		loadingMore = false,
		manualTotal = 0,
		onCreateTag,
		onDeleteDocument,
		onLoadMore = () => {},
		onReconnectFolder = () => {},
		onRemoveFolder,
		onRetryFolder = () => {},
		onSyncFolder,
		syncStatuses = new Map(),
		onToggle,
		onToggleActive,
		onToggleGroup,
		onToggleTag,
		selectedIds,
		tags,
		total = 0
	}: Props = $props();
	const collapsed = new SvelteSet<string>();
	let viewport = $state<HTMLDivElement | null>(null);

	const groups = $derived.by(() => {
		const registeredIds = new Set(folders.map(({ id }) => id));
		const countByFolder = new Map(folderCounts.map(({ folderId, total }) => [folderId, total]));
		const registeredTotal = folderCounts.reduce(
			(sum, { folderId, total }) =>
				folderId !== null && registeredIds.has(folderId) ? sum + total : sum,
			0
		);
		const values: DocumentGroup[] = folders.map((folder) => ({
			key: folder.id,
			kind: 'folder' as const,
			label: folder.name,
			documents: documents.filter((document) => document.folderId === folder.id),
			folder,
			total: countByFolder.get(folder.id) ?? 0
		}));
		const loose = documents.filter(
			(document) => !document.folderId || !registeredIds.has(document.folderId)
		);
		const individual = loose.filter((document) => document.origin !== 'MANUAL');
		const manual = loose.filter((document) => document.origin === 'MANUAL');
		const individualTotal = total - registeredTotal - manualTotal;
		if (individual.length || individualTotal > 0) {
			values.push({
				key: 'individual',
				kind: 'individual',
				label: 'Individual files',
				documents: individual,
				folder: null,
				total: individualTotal
			});
		}
		if (manual.length || manualTotal > 0) {
			values.push({
				key: 'manual',
				kind: 'manual',
				label: 'Manually Loaded',
				documents: manual,
				folder: null,
				total: manualTotal
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
						onCheckedChange={(selected) => onToggleGroup(group.folder?.id ?? group.kind, selected)}
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
								onCreateTag={(tag) => onCreateTag(document, tag)}
								onDelete={() => onDeleteDocument(document)}
								onToggle={(selected) => onToggle(document.id, selected)}
								onToggleActive={() => onToggleActive(document)}
								onToggleTag={(tag) => onToggleTag(document, tag)}
								selected={selectedIds.has(document.id)}
							/>
						{:else}
							<p class="px-2 py-3 text-xs text-muted-foreground">
								{group.total > 0
									? 'Not loaded yet — scroll the list to load more.'
									: 'No matching documents.'}
							</p>
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
		{#if hasMore}
			<div
				aria-hidden="true"
				use:infiniteScroll={{ disabled: busy || loadingMore, onLoadMore, root: viewport }}
			></div>
			<p class="pb-2 text-center text-xs text-muted-foreground">
				{loadingMore
					? 'Loading more documents…'
					: `Showing ${documents.length} of ${total} documents`}
			</p>
		{/if}
	</div>
</ScrollArea>
