<script lang="ts">
	import ClipboardPen from '@lucide/svelte/icons/clipboard-pen';
	import FilePlus from '@lucide/svelte/icons/file-plus';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Video from '@lucide/svelte/icons/video';
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { folderSyncEngine } from '$lib/client/folder-sync/sync-engine.svelte';
	import {
		DialogConfirmation,
		DialogDocumentSyncProgress,
		DialogDocumentTagPicker,
		DialogDocumentTextEntry,
		DialogDocumentYoutubeEntry,
		DialogProgress
	} from '$lib/components/app/dialogs';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { INGESTABLE_FILE_ACCEPT, INGESTABLE_FILE_EXTENSIONS } from '$lib/constants';
	import { documentsStore } from '$lib/stores';
	import type { ApiDocumentSyncResult, ApiSyncedFolder, DocumentRow } from '$lib/types';
	import {
		FOLDER_SYNC_UNSUPPORTED_MESSAGE,
		pickDirectory,
		pickFiles,
		supportsFolderSync
	} from '$lib/utils';
	import DocumentBulkActionsBar from './DocumentBulkActionsBar.svelte';
	import DocumentFilterBar from './DocumentFilterBar.svelte';
	import DocumentList from './DocumentList.svelte';
	import DocumentModeBar from './DocumentModeBar.svelte';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	interface PendingFolderRemoval {
		folder: ApiSyncedFolder;
		removeDocuments: boolean;
	}

	type TagPickerMode = 'add' | 'remove';

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onToggleCollapse = () => {},
		onClose = () => {}
	}: Props = $props();

	let pendingDeactivateAll = $state(false);
	let pendingRemoveAll = $state(false);
	let textEntryOpen = $state(false);
	let youtubeEntryOpen = $state(false);
	let uploading = $state(false);
	// The ingest progress dialog can be hidden while a job keeps running; a
	// reopen button appears in its place until the job finishes.
	let progressDialogOpen = $state(true);
	let pendingDeleteTag = $state<string | null>(null);
	let pendingDeleteDocument = $state<DocumentRow | null>(null);
	let pendingFolderRemoval = $state<PendingFolderRemoval | null>(null);
	let tagPickerOpen = $state(false);
	let tagPickerMode = $state<TagPickerMode>('add');
	let status = $state('');

	const busy = $derived(uploading || documentsStore.loading || documentsStore.syncing);
	const selectedCount = $derived(documentsStore.selectedIds.size);
	const folderSyncSupported = supportsFolderSync();

	onMount(() => void reloadLibrary());
	onDestroy(() => folderSyncEngine.dispose());

	async function reloadLibrary(): Promise<void> {
		await documentsStore.load();
		if (documentsStore.error) toast.error(documentsStore.error);
		await folderSyncEngine.initialize();
	}

	async function addFiles(): Promise<void> {
		const files = await pickFiles({
			multiple: true,
			extensions: INGESTABLE_FILE_EXTENSIONS,
			accept: INGESTABLE_FILE_ACCEPT,
			description: 'Documents'
		});
		if (!files.length) return;
		uploading = true;
		progressDialogOpen = true;
		let succeeded = 0;
		let failed = 0;
		try {
			for (const file of files) {
				try {
					await documentsStore.ingestFile(file);
					succeeded += 1;
				} catch (error) {
					failed += 1;
					toast.error(error instanceof Error ? error.message : String(error));
				}
			}
			status = `Added ${succeeded} file${succeeded === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}.`;
			if (succeeded) toast.success(`${succeeded} file${succeeded === 1 ? '' : 's'} ingested`);
		} finally {
			uploading = false;
			documentsStore.progress = null;
		}
	}

	async function ingestText(title: string, text: string): Promise<void> {
		textEntryOpen = false;
		uploading = true;
		progressDialogOpen = true;
		try {
			await documentsStore.ingestText(title, text);
			status = 'Text embedded into the corpus.';
			toast.success('Text embedded');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			uploading = false;
			documentsStore.progress = null;
		}
	}

	async function ingestYoutube(url: string): Promise<void> {
		youtubeEntryOpen = false;
		uploading = true;
		progressDialogOpen = true;
		try {
			const result = await documentsStore.ingestYoutube(url);
			status = `Imported the transcript for “${result.title}”.`;
			toast.success('Transcript imported');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			uploading = false;
			documentsStore.progress = null;
		}
	}

	function syncSummary(result: ApiDocumentSyncResult | null): string {
		if (!result) return 'Folder sync finished.';
		const { added, removed, unchanged, failed, heldBack } = result;
		const parts = [
			`${added} added`,
			`${removed} removed`,
			`${unchanged} unchanged`,
			`${failed} failed`
		];
		if (heldBack) parts.push(`${heldBack} malformed, awaiting retry`);
		return `Synced: ${parts.join(', ')}.`;
	}

	async function syncNewFolder(): Promise<void> {
		try {
			const handle = await pickDirectory();
			if (!handle) return;
			const result = await folderSyncEngine.addFolder(handle);
			status = syncSummary(result);
			toast.success('Folder registered and synced');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function syncFolder(folder: ApiSyncedFolder): Promise<void> {
		try {
			const result = await folderSyncEngine.syncFolder(folder.id);
			status = syncSummary(result);
			toast.success('Folder synced');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function retryFolderMalformed(folder: ApiSyncedFolder): Promise<void> {
		try {
			const result = await folderSyncEngine.retryMalformed(folder.id);
			status = syncSummary(result);
			toast.success(
				`Retried ${folder.malformedCount} malformed file${folder.malformedCount === 1 ? '' : 's'}`
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function reconnectFolder(folder: ApiSyncedFolder): Promise<void> {
		try {
			const syncStatus = folderSyncEngine.statuses.get(folder.id);
			if (syncStatus === 'permission-needed') {
				await folderSyncEngine.requestAccess(folder.id);
			} else {
				const handle = await pickDirectory();
				if (!handle) return;
				await folderSyncEngine.reconnect(folder.id, handle);
			}
			toast.success('Folder reconnected');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function removeFolder(): Promise<void> {
		if (!pendingFolderRemoval) return;
		const { folder, removeDocuments } = pendingFolderRemoval;
		try {
			await documentsStore.removeFolder(folder.id, removeDocuments);
			await folderSyncEngine.forget(folder.id);
			status = removeDocuments
				? 'Folder and its synced documents removed.'
				: 'Folder unwatched; stored documents were kept.';
			pendingFolderRemoval = null;
			toast.success(removeDocuments ? 'Synced folder removed' : 'Folder unwatched');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function removeDocument(): Promise<void> {
		if (!pendingDeleteDocument) return;
		try {
			await documentsStore.removeDocument(pendingDeleteDocument.id);
			pendingDeleteDocument = null;
			status = 'Document removed.';
			toast.success('Document removed');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function createTag(tag: string): Promise<void> {
		await documentsStore.createTag(tag);
		toast.success(`#${tag} created`);
	}

	async function createAndAssignTag(document: DocumentRow, tag: string): Promise<void> {
		await documentsStore.createTag(tag);
		await documentsStore.setTagAssignment([document.id], tag, true);
		toast.success(`#${tag} created and applied`);
	}

	async function deleteTag(): Promise<void> {
		if (!pendingDeleteTag) return;
		try {
			await documentsStore.deleteTag(pendingDeleteTag);
			pendingDeleteTag = null;
			toast.success('Tag deleted');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function toggleDocumentTag(document: DocumentRow, tag: string): Promise<void> {
		try {
			await documentsStore.setTagAssignment([document.id], tag, !document.tags.includes(tag));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function toggleDocumentActive(document: DocumentRow): Promise<void> {
		try {
			await documentsStore.setActivation([document.id], !document.active);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function bulkSetActivation(active: boolean): Promise<void> {
		try {
			await documentsStore.setActivation([...documentsStore.selectedIds], active);
			toast.success(active ? 'Documents activated' : 'Documents deactivated');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function deactivateAll(): Promise<void> {
		pendingDeactivateAll = false;
		try {
			await documentsStore.setActivation(null, false);
			toast.success('All documents deactivated');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function removeAll(): Promise<void> {
		pendingRemoveAll = false;
		try {
			await documentsStore.removeAllDocuments();
			status = 'All documents removed.';
			toast.success('All documents removed');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	function openBulkPicker(mode: TagPickerMode): void {
		if (!documentsStore.tags.length) {
			toast.info('Create a tag first');
			return;
		}
		tagPickerMode = mode;
		tagPickerOpen = true;
	}

	async function applyBulkTag(tag: string): Promise<void> {
		tagPickerOpen = false;
		try {
			await documentsStore.setTagAssignment(
				[...documentsStore.selectedIds],
				tag,
				tagPickerMode === 'add'
			);
			toast.success(tagPickerMode === 'add' ? 'Tag applied' : 'Tag removed');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<WorkspaceWindow
	{collapsed}
	{closable}
	{height}
	{id}
	{onClose}
	{onToggleCollapse}
	{title}
	contentClass="overflow-hidden"
	contentLabel="Documents"
>
	<div class="flex h-full min-h-0 flex-col gap-3">
		<DocumentFilterBar
			bind:query={() => documentsStore.query, (value) => documentsStore.setQuery(value)}
			onCreateTag={createTag}
			onDeleteTag={(tag) => (pendingDeleteTag = tag)}
			onSortChange={(next) => documentsStore.setSort(next)}
			onToggleTag={(tag) => documentsStore.toggleTagFilter(tag)}
			selectedTags={documentsStore.tagFilters}
			sort={documentsStore.sort}
			tags={documentsStore.tags}
		/>
		<DocumentModeBar
			{busy}
			mode={documentsStore.mode}
			onDeactivateAll={() => (pendingDeactivateAll = true)}
			onModeChange={(mode) => documentsStore.setMode(mode)}
			onRemoveAll={() => (pendingRemoveAll = true)}
		/>
		{#if status}<p class="text-xs text-muted-foreground">{status}</p>{/if}
		<div class="text-xs text-muted-foreground">
			{selectedCount} selected. With none selected, chat searches all documents.
		</div>
		<div class="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-2">
			<DocumentBulkActionsBar
				count={selectedCount}
				onActivate={() => void bulkSetActivation(true)}
				onApplyTag={() => openBulkPicker('add')}
				onDeactivate={() => void bulkSetActivation(false)}
				onRemoveTag={() => openBulkPicker('remove')}
			/>
			<DocumentList
				{busy}
				documents={documentsStore.documents}
				folderCounts={documentsStore.folderCounts}
				folders={documentsStore.folders}
				hasMore={documentsStore.hasMore}
				loadingMore={documentsStore.loadingMore}
				manualTotal={documentsStore.manualTotal}
				onCreateTag={(document, tag) => createAndAssignTag(document, tag)}
				onDeleteDocument={(document) => (pendingDeleteDocument = document)}
				onLoadMore={() => void documentsStore.loadMore()}
				onReconnectFolder={(folder) => void reconnectFolder(folder)}
				onRemoveFolder={(folder, removeDocuments) =>
					(pendingFolderRemoval = { folder, removeDocuments })}
				onRetryFolder={(folder) => void retryFolderMalformed(folder)}
				onSyncFolder={(folder) => void syncFolder(folder)}
				syncStatuses={folderSyncEngine.statuses}
				onToggle={(documentId, selected) => documentsStore.setSelection([documentId], selected)}
				onToggleActive={(document) => void toggleDocumentActive(document)}
				onToggleGroup={(group, selected) => void documentsStore.selectGroup(group, selected)}
				onToggleTag={(document, tag) => void toggleDocumentTag(document, tag)}
				selectedIds={documentsStore.selectedIds}
				tags={documentsStore.tags}
				total={documentsStore.total}
			/>
		</div>
		<div class="grid gap-2 border-t pt-3">
			{#if uploading && !progressDialogOpen}
				<Button class="w-full" variant="outline" onclick={() => (progressDialogOpen = true)}>
					<Loader2 class="animate-spin" /> Show ingest progress
				</Button>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} class="w-full" disabled={busy}>
							<Plus /> Add to corpus
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="center" class="w-52">
					<DropdownMenu.Item onclick={() => void addFiles()}>
						<FilePlus /> Add files
					</DropdownMenu.Item>
					{#if folderSyncSupported}
						<DropdownMenu.Item onclick={() => void syncNewFolder()}>
							<FolderPlus /> Sync folder
						</DropdownMenu.Item>
					{:else}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<span {...props}>
										<DropdownMenu.Item disabled>
											<FolderPlus /> Sync folder
										</DropdownMenu.Item>
									</span>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>{FOLDER_SYNC_UNSUPPORTED_MESSAGE}</Tooltip.Content>
						</Tooltip.Root>
					{/if}
					<DropdownMenu.Item onclick={() => (textEntryOpen = true)}>
						<ClipboardPen /> Add text
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => (youtubeEntryOpen = true)}>
						<Video /> Add video
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</WorkspaceWindow>

<DialogDocumentTagPicker
	onOpenChange={(open) => (tagPickerOpen = open)}
	onSelect={(tag) => void applyBulkTag(tag)}
	open={tagPickerOpen}
	tags={documentsStore.tags}
	title={tagPickerMode === 'add' ? 'Tag to apply' : 'Tag to remove'}
/>
<DialogDocumentTextEntry
	disabled={busy}
	onOpenChange={(open) => (textEntryOpen = open)}
	onSubmit={(title, text) => void ingestText(title, text)}
	open={textEntryOpen}
/>
<DialogDocumentYoutubeEntry
	disabled={busy}
	onOpenChange={(open) => (youtubeEntryOpen = open)}
	onSubmit={(url) => void ingestYoutube(url)}
	open={youtubeEntryOpen}
/>
<DialogProgress
	dismissible
	onClose={() => (progressDialogOpen = false)}
	open={uploading && progressDialogOpen}
	progress={documentsStore.progress}
	title="Ingesting file"
/>
<DialogDocumentSyncProgress
	files={documentsStore.syncFiles}
	open={documentsStore.syncing}
	progress={documentsStore.syncProgress}
	settled={documentsStore.syncSettled}
	total={documentsStore.syncTotal}
/>

<DialogConfirmation
	confirmLabel="Delete tag"
	description={`Delete #${pendingDeleteTag ?? ''} and remove it from every document?`}
	onConfirm={deleteTag}
	onOpenChange={(open) => !open && (pendingDeleteTag = null)}
	open={Boolean(pendingDeleteTag)}
/>
<DialogConfirmation
	confirmLabel="Deactivate all"
	description="Deactivate every document for RAG? No document chunks will be retrieved in chat or search until you activate documents again."
	onConfirm={deactivateAll}
	onOpenChange={(open) => (pendingDeactivateAll = open)}
	open={pendingDeactivateAll}
/>
<DialogConfirmation
	confirmLabel="Remove all documents"
	description="Remove ALL documents from the library? This deletes their stored chunks and managed files. Synced files remain ignored while their folder is watched."
	onConfirm={removeAll}
	onOpenChange={(open) => (pendingRemoveAll = open)}
	open={pendingRemoveAll}
/>
<DialogConfirmation
	confirmLabel="Remove document"
	description={`Remove “${pendingDeleteDocument?.title ?? ''}” from the document library? Synced files remain ignored while their folder is watched.`}
	onConfirm={removeDocument}
	onOpenChange={(open) => !open && (pendingDeleteDocument = null)}
	open={Boolean(pendingDeleteDocument)}
/>
<DialogConfirmation
	confirmLabel={pendingFolderRemoval?.removeDocuments
		? 'Remove folder and documents'
		: 'Unwatch folder'}
	description={pendingFolderRemoval?.removeDocuments
		? `Stop syncing ${pendingFolderRemoval.folder.name} and remove every document synced from it?`
		: `Stop syncing ${pendingFolderRemoval?.folder.name ?? ''} and keep the stored documents?`}
	onConfirm={removeFolder}
	onOpenChange={(open) => !open && (pendingFolderRemoval = null)}
	open={Boolean(pendingFolderRemoval)}
/>
