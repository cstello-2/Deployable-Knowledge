<script lang="ts">
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		DialogConfirmation,
		DialogDocumentFilePicker,
		DialogDocumentSyncProgress,
		DialogDocumentTagPicker,
		DialogProgress
	} from '$lib/components/app/dialogs';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import { Button } from '$lib/components/ui/button';
	import { documentsStore } from '$lib/stores';
	import type {
		ApiDocumentDirectoryResponse,
		ApiDocumentFolderSyncResponse,
		ApiSyncedFolder,
		DocumentRow
	} from '$lib/types';
	import { fuzzyDocumentScore } from '$lib/utils';
	import DocumentBulkActionsBar from './DocumentBulkActionsBar.svelte';
	import DocumentFilterBar from './DocumentFilterBar.svelte';
	import DocumentIngestFailures from './DocumentIngestFailures.svelte';
	import DocumentList from './DocumentList.svelte';
	import DocumentModeBar, { type DocumentListMode } from './DocumentModeBar.svelte';

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

	let query = $state('');
	let tagFilters = $state<string[]>([]);
	let listMode = $state<DocumentListMode>('all');
	let pendingDeactivateAll = $state(false);
	let pendingRemoveAll = $state(false);
	let filePickerOpen = $state(false);
	let pickerDirectory = $state<ApiDocumentDirectoryResponse | null>(null);
	let pickerLoading = $state(false);
	let pickerSelectedPaths = $state<string[]>([]);
	let uploading = $state(false);
	let pendingDeleteTag = $state<string | null>(null);
	let pendingDeleteDocument = $state<DocumentRow | null>(null);
	let pendingFolderRemoval = $state<PendingFolderRemoval | null>(null);
	let tagPickerOpen = $state(false);
	let tagPickerMode = $state<TagPickerMode>('add');
	let status = $state('');
	let dragActive = $state(false);
	let dragDepth = 0;

	const busy = $derived(uploading || documentsStore.loading || documentsStore.syncing);
	const selectedCount = $derived(documentsStore.selectedIds.size);
	const visibleDocuments = $derived.by(() => {
		const tagged = documentsStore.documents.filter((document) => {
			if (listMode === 'active' && !document.active) return false;
			if (listMode === 'inactive' && document.active) return false;
			return !tagFilters.length || tagFilters.some((tag) => document.tags.includes(tag));
		});
		if (!query.trim()) return tagged;
		return tagged
			.map((document) => ({ document, score: fuzzyDocumentScore(query, document) }))
			.filter(({ score }) => score > 0.25)
			.sort((a, b) => b.score - a.score)
			.map(({ document }) => document);
	});

	onMount(() => {
		void reloadLibrary();
		window.addEventListener('paste', handlePaste);
		return () => window.removeEventListener('paste', handlePaste);
	});

	async function reloadLibrary(): Promise<void> {
		await documentsStore.load();
		tagFilters = tagFilters.filter((tag) => documentsStore.tags.includes(tag));
		if (documentsStore.error) toast.error(documentsStore.error);
	}

	async function openFilePicker(): Promise<void> {
		filePickerOpen = true;
		pickerSelectedPaths = [];
		await navigateDirectory('');
	}

	async function navigateDirectory(path: string): Promise<void> {
		pickerLoading = true;
		try {
			pickerDirectory = await documentsStore.browseDirectory(path);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			pickerLoading = false;
		}
	}

	function toggleFilter(tag: string): void {
		tagFilters = tagFilters.includes(tag)
			? tagFilters.filter((item) => item !== tag)
			: [...tagFilters, tag];
	}

	async function ingestPaths(paths: string[]): Promise<void> {
		if (!paths.length) return;
		filePickerOpen = false;
		uploading = true;
		let succeeded = 0;
		let failed = 0;
		try {
			for (const path of paths) {
				try {
					await documentsStore.ingestPath(path);
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
			pickerSelectedPaths = [];
			documentsStore.progress = null;
		}
	}

	// Lets a file copied in the OS file browser (Ctrl+C) be pasted straight into the
	// window (Ctrl+V) instead of requiring the folder picker.
	async function uploadFiles(files: File[]): Promise<void> {
		if (!files.length || busy) return;
		uploading = true;
		let succeeded = 0;
		let failed = 0;
		try {
			for (const file of files) {
				try {
					await documentsStore.uploadFile(file);
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

	// .files is the common case, but some Chromium builds only populate .items for an
	// OS-level file copy (e.g. Explorer's Ctrl+C) rather than .files directly - check
	// both before giving up.
	function filesFromClipboard(data: DataTransfer): File[] {
		if (data.files.length > 0) return [...data.files];

		const fromItems: File[] = [];
		for (const item of data.items) {
			if (item.kind !== 'file') continue;
			const file = item.getAsFile();
			if (file) fromItems.push(file);
		}
		return fromItems;
	}

	function handlePaste(event: ClipboardEvent): void {
		if (busy) return;
		if (!event.clipboardData) return;
		const files = filesFromClipboard(event.clipboardData);
		if (files.length === 0) {
			// Only warn when the clipboard actually had *something* - otherwise a
			// completely unrelated Ctrl+V (e.g. pasting text into another window)
			// would trigger a confusing toast every time.
			if (event.clipboardData.types.length > 0) {
				console.debug('[paste] clipboard types with no usable file:', event.clipboardData.types);
				toast.error(
					`Nothing to upload from the clipboard (saw: ${event.clipboardData.types.join(', ') || 'nothing'}). Copy the file itself (Ctrl+C in your file browser), not a path or a shortcut to it.`
				);
			}
			return;
		}

		event.preventDefault();
		void uploadFiles(files);
	}

	// Paste can't reliably see files copied from the OS file browser (Chromium doesn't
	// consistently expose them through clipboardData.files), so drag-and-drop is the
	// dependable path for getting a file in without the folder picker.
	function handleDragEnter(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragDepth += 1;
		dragActive = true;
	}

	function handleDragOver(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
	}

	function handleDragLeave(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragActive = false;
	}

	function handleDrop(event: DragEvent): void {
		dragDepth = 0;
		dragActive = false;
		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		event.preventDefault();
		void uploadFiles([...files]);
	}

	function syncSummary(result: ApiDocumentFolderSyncResponse): string {
		if (!result.result) return 'Folder sync finished.';
		const { added, updated, removed, unchanged, failed } = result.result;
		return `Synced: ${added} added, ${updated} updated, ${removed} removed, ${unchanged} unchanged, ${failed} failed.`;
	}

	async function addFolder(path: string): Promise<void> {
		filePickerOpen = false;
		try {
			const result = await documentsStore.addFolder(path);
			status = syncSummary(result);
			toast.success(result.created ? 'Folder registered and synced' : 'Folder synced');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function syncFolder(folder: ApiSyncedFolder): Promise<void> {
		try {
			const result = await documentsStore.syncFolder(folder.id);
			status = syncSummary(result);
			toast.success('Folder synced');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function removeFolder(): Promise<void> {
		if (!pendingFolderRemoval) return;
		const { folder, removeDocuments } = pendingFolderRemoval;
		try {
			await documentsStore.removeFolder(folder.id, removeDocuments);
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
			tagFilters = tagFilters.filter((tag) => tag !== pendingDeleteTag);
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

	async function dismissFailure(id: string): Promise<void> {
		try {
			await documentsStore.dismissFailure(id);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function clearFailures(): Promise<void> {
		try {
			await documentsStore.clearFailures();
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
	<div
		class={[
			'relative flex h-full min-h-0 flex-col gap-3',
			dragActive && 'outline-2 outline-dashed outline-primary outline-offset-[-2px]'
		]}
		ondragenter={handleDragEnter}
		ondragleave={handleDragLeave}
		ondragover={handleDragOver}
		ondrop={handleDrop}
		role="region"
		aria-label="Document drop zone"
	>
		{#if dragActive}
			<div
				class="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/90 text-sm font-medium text-primary"
			>
				Drop to upload
			</div>
		{/if}
		<DocumentFilterBar
			bind:query
			onCreateTag={createTag}
			onDeleteTag={(tag) => (pendingDeleteTag = tag)}
			onToggleTag={toggleFilter}
			selectedTags={tagFilters}
			tags={documentsStore.tags}
		/>
		<DocumentModeBar
			{busy}
			mode={listMode}
			onDeactivateAll={() => (pendingDeactivateAll = true)}
			onModeChange={(mode) => (listMode = mode)}
			onRemoveAll={() => (pendingRemoveAll = true)}
		/>
		{#if status}<p class="text-xs text-muted-foreground">{status}</p>{/if}
		<DocumentIngestFailures
			failures={documentsStore.failures}
			onClearAll={clearFailures}
			onDismiss={dismissFailure}
		/>
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
				documents={visibleDocuments}
				folders={documentsStore.folders}
				onCreateTag={(document, tag) => createAndAssignTag(document, tag)}
				onDeleteDocument={(document) => (pendingDeleteDocument = document)}
				onRemoveFolder={(folder, removeDocuments) =>
					(pendingFolderRemoval = { folder, removeDocuments })}
				onSyncFolder={(folder) => void syncFolder(folder)}
				onToggle={(documentId, selected) => documentsStore.setSelection([documentId], selected)}
				onToggleActive={(document) => void toggleDocumentActive(document)}
				onToggleGroup={(ids, selected) => documentsStore.setSelection(ids, selected)}
				onToggleTag={(document, tag) => void toggleDocumentTag(document, tag)}
				selectedIds={documentsStore.selectedIds}
				tags={documentsStore.tags}
			/>
		</div>
		<div class="border-t pt-3">
			<Button class="w-full" disabled={busy} onclick={() => void openFilePicker()}>
				<FolderPlus /> Add files
			</Button>
		</div>
	</div>
</WorkspaceWindow>

<DialogDocumentFilePicker
	directory={pickerDirectory}
	disabled={busy}
	loading={pickerLoading}
	onNavigate={(path) => void navigateDirectory(path)}
	onOpenChange={(open) => (filePickerOpen = open)}
	onSelectedPathsChange={(paths) => (pickerSelectedPaths = paths)}
	onSubmitPaths={(paths) => void ingestPaths(paths)}
	onSyncFolder={(path) => void addFolder(path)}
	open={filePickerOpen}
	selectedPaths={pickerSelectedPaths}
/>
<DialogDocumentTagPicker
	onOpenChange={(open) => (tagPickerOpen = open)}
	onSelect={(tag) => void applyBulkTag(tag)}
	open={tagPickerOpen}
	tags={documentsStore.tags}
	title={tagPickerMode === 'add' ? 'Tag to apply' : 'Tag to remove'}
/>
<DialogProgress open={uploading} progress={documentsStore.progress} title="Ingesting file" />
<DialogDocumentSyncProgress
	files={documentsStore.syncFiles}
	open={documentsStore.syncing}
	progress={documentsStore.syncProgress}
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
		? `Stop watching ${pendingFolderRemoval.folder.path} and remove every document synced from it?`
		: `Stop watching ${pendingFolderRemoval?.folder.path ?? ''} and keep the stored documents?`}
	onConfirm={removeFolder}
	onOpenChange={(open) => !open && (pendingFolderRemoval = null)}
	open={Boolean(pendingFolderRemoval)}
/>
