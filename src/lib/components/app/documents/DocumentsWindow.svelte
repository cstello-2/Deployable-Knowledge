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
	import DocumentBulkActionsBar from './DocumentBulkActionsBar.svelte';
	import DocumentFilterBar from './DocumentFilterBar.svelte';
	import DocumentList from './DocumentList.svelte';

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

	const busy = $derived(uploading || documentsStore.loading || documentsStore.syncing);
	const selectedCount = $derived(documentsStore.selectedIds.size);
	const visibleDocuments = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		return documentsStore.documents.filter((document) => {
			if (tagFilters.length && !tagFilters.some((tag) => document.tags.includes(tag))) return false;
			return (
				!normalized ||
				`${document.title} ${document.id} ${document.tags.join(' ')}`
					.toLowerCase()
					.includes(normalized)
			);
		});
	});

	onMount(() => void reloadLibrary());

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
			status = `Added ${succeeded} PDF${succeeded === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}.`;
			if (succeeded) toast.success(`${succeeded} PDF${succeeded === 1 ? '' : 's'} ingested`);
		} finally {
			uploading = false;
			pickerSelectedPaths = [];
			documentsStore.progress = null;
		}
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
			bind:query
			onCreateTag={createTag}
			onDeleteTag={(tag) => (pendingDeleteTag = tag)}
			onToggleTag={toggleFilter}
			selectedTags={tagFilters}
			tags={documentsStore.tags}
		/>
		{#if status}<p class="text-xs text-muted-foreground">{status}</p>{/if}
		<div class="text-xs text-muted-foreground">
			{selectedCount} selected. With none selected, chat searches all documents.
		</div>
		<div class="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-2">
			<DocumentBulkActionsBar
				count={selectedCount}
				onApplyTag={() => openBulkPicker('add')}
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
				onToggleGroup={(ids, selected) => documentsStore.setSelection(ids, selected)}
				onToggleTag={(document, tag) => void toggleDocumentTag(document, tag)}
				selectedIds={documentsStore.selectedIds}
				tags={documentsStore.tags}
			/>
		</div>
		<div class="border-t pt-3">
			<Button class="w-full" disabled={busy} onclick={() => void openFilePicker()}>
				<FolderPlus /> Add documents
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
<DialogProgress open={uploading} progress={documentsStore.progress} title="Ingesting PDF" />
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
