<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { ApiError } from '$lib/utils';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		NOTEBOOK_TEXT_CHARACTER_LIMIT,
		NOTEBOOK_TEXT_WARNING_CHARACTER_COUNT
	} from '$lib/constants';
	import { documentsStore, notebooksStore } from '$lib/stores';
	import type { NotebookPage, NotebookSourceItem, NotebookWithPages } from '$lib/types';
	import { createNotebookAutosave } from './notebook-autosave';
	import { notebookCountLabel } from './notebook-format';
	import type { NotebookDeleteTarget, NotebookRenameTarget, NotebookView } from './notebook-types';
	import NotebookEditor from './NotebookEditor.svelte';
	import NotebookExportDialog from './NotebookExportDialog.svelte';
	import NotebookHeader from './NotebookHeader.svelte';
	import NotebookList from './NotebookList.svelte';
	import NotebookPageList from './NotebookPageList.svelte';
	import NotebookPreview from './NotebookPreview.svelte';
	import NotebookSearchDialog from './NotebookSearchDialog.svelte';
	import type { NotebookSearchResult } from '$lib/utils/notebook-search';
	import { insertNotebookSourceCitation } from '$lib/utils/notebook-citations';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	type TextDialogMode = 'create-notebook' | 'create-page' | 'rename';

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onToggleCollapse = () => {},
		onClose = () => {}
	}: Props = $props();

	let notes = $state('');
	let previewMode = $state(false);
	let view = $state<NotebookView>('editor');
	let syncedPageId = $state<string | null>(null);
	let lastSavedNotes = $state('');
	let textDialogMode = $state<TextDialogMode | null>(null);
	let textDialogValue = $state('');
	let renameTarget = $state<NotebookRenameTarget | null>(null);
	let deleteTarget = $state<NotebookDeleteTarget | null>(null);
	let movePageTarget = $state<NotebookPage | null>(null);
	let moveDestinationId = $state('');
	let notebookSearchOpen = $state(false);
	let notebookExportOpen = $state(false);
	let notesTextarea = $state<HTMLTextAreaElement | null>(null);

	const otherPageCharacters = $derived(
		notebooksStore.activeNotebook?.pages.reduce(
			(total, page) =>
				page.id === notebooksStore.activePage?.id ? total : total + page.content.length,
			0
		) ?? 0
	);
	const pageLimit = $derived(Math.max(0, NOTEBOOK_TEXT_CHARACTER_LIMIT - otherPageCharacters));
	const characterCount = $derived(otherPageCharacters + notes.length);
	const charactersRemaining = $derived(Math.max(0, NOTEBOOK_TEXT_CHARACTER_LIMIT - characterCount));
	const nearLimit = $derived(characterCount >= NOTEBOOK_TEXT_WARNING_CHARACTER_COUNT);
	const atLimit = $derived(characterCount >= NOTEBOOK_TEXT_CHARACTER_LIMIT);

	async function saveCurrentPage(): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		const page = notebooksStore.activePage;
		if (!notebook || !page) return;
		const savedNotes = notes;
		try {
			await notebooksStore.updatePage(notebook.id, page.id, savedNotes);
			lastSavedNotes = savedNotes;
		} catch (error) {
			if (error instanceof ApiError && error.status === 413) {
				toast.error(
					`Notebook text is limited to ${NOTEBOOK_TEXT_CHARACTER_LIMIT.toLocaleString()} characters`
				);
			} else {
				toast.error(message(error));
			}
		}
	}

	const autosave = createNotebookAutosave(saveCurrentPage);

	$effect(() => {
		const page = notebooksStore.activePage;
		const content = page?.content ?? '';
		if (page?.id !== syncedPageId) {
			syncedPageId = page?.id ?? null;
			notes = content;
			lastSavedNotes = content;
			return;
		}
		if (notes === lastSavedNotes && content !== lastSavedNotes) {
			notes = content;
			lastSavedNotes = content;
		}
	});

	onMount(async () => {
		await notebooksStore.load();
		if (notebooksStore.error) toast.error(notebooksStore.error);
		if (!notebooksStore.activeNotebook) view = 'notebooks';
		else if (!notebooksStore.activePage) view = 'pages';
	});

	onDestroy(() => autosave.destroy());

	function goBack(): void {
		view = view === 'editor' ? 'pages' : 'notebooks';
	}

	async function openNotebook(notebook: NotebookWithPages): Promise<void> {
		await autosave.flush();
		try {
			if (notebook.id !== notebooksStore.activeNotebookId) {
				await notebooksStore.select(notebook.id);
			}
			view = 'pages';
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function openPage(page: NotebookPage): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook) return;
		await autosave.flush();
		try {
			if (page.id !== notebooksStore.activePage?.id) {
				await notebooksStore.selectPage(notebook.id, page.id);
			}
			view = 'editor';
			previewMode = false;
		} catch (error) {
			toast.error(message(error));
		}
	}

	function openCreate(): void {
		if (view === 'notebooks') {
			textDialogMode = 'create-notebook';
			textDialogValue = 'New Notebook';
		} else {
			const count = notebooksStore.activeNotebook?.pages.length ?? 0;
			textDialogMode = 'create-page';
			textDialogValue = `Page ${count + 1}`;
		}
	}

	function openRename(target: NotebookWithPages | NotebookPage, kind: 'notebook' | 'page'): void {
		renameTarget = { kind, id: target.id, title: target.title };
		textDialogMode = 'rename';
		textDialogValue = target.title;
	}

	function openDeleteNotebook(notebook: NotebookWithPages): void {
		deleteTarget = {
			kind: 'notebook',
			id: notebook.id,
			title: notebook.title,
			detail: `Delete “${notebook.title}” and its ${notebookCountLabel(notebook.pages.length, 'page')}? This cannot be undone.`
		};
	}

	function openDeletePage(page: NotebookPage): void {
		deleteTarget = {
			kind: 'page',
			id: page.id,
			title: page.title,
			detail: `Delete “${page.title}”? This cannot be undone.`
		};
	}

	function openMovePage(page: NotebookPage): void {
		movePageTarget = page;
		moveDestinationId =
			notebooksStore.notebooks.find(({ id }) => id !== notebooksStore.activeNotebookId)?.id ?? '';
	}

	async function movePage(): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook || !movePageTarget || !moveDestinationId) return;
		await autosave.flush();
		try {
			await notebooksStore.movePage(notebook.id, movePageTarget.id, moveDestinationId);
			movePageTarget = null;
			toast.success('Page moved');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function openSearchResult(result: NotebookSearchResult): Promise<void> {
		await autosave.flush();
		try {
			if (result.notebookId !== notebooksStore.activeNotebookId) {
				await notebooksStore.select(result.notebookId);
			}
			await notebooksStore.selectPage(result.notebookId, result.pageId);
			view = 'editor';
			previewMode = false;
			notebookSearchOpen = false;
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function submitTextDialog(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const value = textDialogValue.trim();
		if (!value || !textDialogMode) return;
		await autosave.flush();
		try {
			if (textDialogMode === 'create-notebook') {
				await notebooksStore.create(value);
				view = 'editor';
				toast.success('Notebook created');
			} else if (textDialogMode === 'create-page') {
				const notebook = notebooksStore.activeNotebook;
				if (!notebook) return;
				await notebooksStore.createPage(notebook.id, value);
				view = 'editor';
				toast.success('Page created');
			} else if (renameTarget?.kind === 'notebook') {
				await notebooksStore.rename(renameTarget.id, value);
				toast.success('Notebook renamed');
			} else if (renameTarget?.kind === 'page') {
				const notebook = notebooksStore.activeNotebook;
				if (!notebook) return;
				await notebooksStore.renamePage(notebook.id, renameTarget.id, value);
				toast.success('Page renamed');
			}
			textDialogMode = null;
			renameTarget = null;
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function confirmDelete(): Promise<void> {
		if (!deleteTarget) return;
		await autosave.flush();
		try {
			if (deleteTarget.kind === 'notebook') {
				await notebooksStore.delete(deleteTarget.id);
				view = 'notebooks';
				toast.success('Notebook deleted');
			} else {
				const notebook = notebooksStore.activeNotebook;
				if (!notebook) return;
				await notebooksStore.deletePage(notebook.id, deleteTarget.id);
				view = 'pages';
				toast.success('Page deleted');
			}
			deleteTarget = null;
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function removeSource(sourceId: string): Promise<void> {
		try {
			await notebooksStore.removeSource(sourceId);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function clearSources(): Promise<void> {
		try {
			await notebooksStore.clearSources();
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function insertCitation(source: NotebookSourceItem): Promise<void> {
		const start = notesTextarea?.selectionStart ?? notes.length;
		const end = notesTextarea?.selectionEnd ?? start;
		const insertion = insertNotebookSourceCitation(notes, source, start, end);
		notes = insertion.text;
		autosave.schedule();
		await tick();
		notesTextarea?.focus();
		notesTextarea?.setSelectionRange(insertion.cursor, insertion.cursor);
		toast.success(`Citation inserted: ${source.documentTitle}, p. ${source.pageIndex + 1}`);
	}

	async function exportNotebook(format: 'markdown' | 'pdf', pageIds: string[]): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook || !pageIds.length) return;
		await autosave.flush();
		try {
			const response = await fetch(`/notebooks/${encodeURIComponent(notebook.id)}/export`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ format, pageIds })
			});
			if (!response.ok) throw new Error('Notebook export failed');
			const blob = await response.blob();
			const disposition = response.headers.get('Content-Disposition') ?? '';
			const filename =
				disposition.match(/filename="([^"]+)"/)?.[1] ??
				`notebook.${format === 'markdown' ? 'md' : 'pdf'}`;
			const href = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = href;
			anchor.download = filename;
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(href), 0);
			notebookExportOpen = false;
			toast.success(`${pageIds.length} ${pageIds.length === 1 ? 'page' : 'pages'} exported`);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function addToMasterCorpus(pageIds: string[]): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook || !pageIds.length) return;
		await autosave.flush();
		try {
			const response = await fetch(`/notebooks/${encodeURIComponent(notebook.id)}/master-corpus`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pageIds })
			});
			const result = (await response.json()) as {
				error?: string;
				pageCount?: number;
				chunkCount?: number;
			};
			if (!response.ok) throw new Error(result.error ?? 'Master Corpus export failed');
			await documentsStore.load();
			notebookExportOpen = false;
			toast.success(
				`${result.pageCount ?? pageIds.length} pages added as ${result.chunkCount ?? 0} searchable chunks`
			);
		} catch (error) {
			toast.error(message(error));
		}
	}

	function headerTitle(): string {
		if (notebooksStore.loading) return 'Loading notebook…';
		if (view === 'notebooks') return 'Notebooks';
		if (view === 'pages') return notebooksStore.activeNotebook?.title ?? 'Notebook';
		return notebooksStore.activePage?.title ?? 'Page';
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<WorkspaceWindow
	{id}
	{title}
	{closable}
	{height}
	{collapsed}
	{onToggleCollapse}
	{onClose}
	contentClass="overflow-hidden"
	contentLabel="Notebook content"
>
	<div class="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
		<NotebookHeader
			{view}
			title={headerTitle()}
			{previewMode}
			sources={notebooksStore.sources}
			sourcesLoading={notebooksStore.sourcesLoading}
			onBack={goBack}
			onCreate={openCreate}
			onExport={() => (notebookExportOpen = true)}
			onInsertCitation={insertCitation}
			onTogglePreview={() => (previewMode = !previewMode)}
			onRemoveSource={removeSource}
			onClearSources={clearSources}
			onSearch={() => (notebookSearchOpen = true)}
		/>
		{#if view === 'notebooks'}
			<NotebookList
				notebooks={notebooksStore.notebooks}
				activeId={notebooksStore.activeNotebookId}
				onOpen={(notebook) => void openNotebook(notebook)}
				onRename={(notebook) => openRename(notebook, 'notebook')}
				onDelete={openDeleteNotebook}
			/>
		{:else if view === 'pages'}
			<NotebookPageList
				pages={notebooksStore.activeNotebook?.pages ?? []}
				activeId={notebooksStore.activePage?.id ?? null}
				onOpen={(page) => void openPage(page)}
				onRename={(page) => openRename(page, 'page')}
				onMove={openMovePage}
				onDelete={openDeletePage}
			/>
		{:else if previewMode}
			<NotebookPreview content={notes} />
		{:else}
			<NotebookEditor
				bind:ref={notesTextarea}
				bind:notes
				{pageLimit}
				{characterCount}
				characterLimit={NOTEBOOK_TEXT_CHARACTER_LIMIT}
				{charactersRemaining}
				{nearLimit}
				{atLimit}
				onInput={autosave.schedule}
			/>
		{/if}
	</div>
</WorkspaceWindow>

<Dialog.Root
	open={Boolean(textDialogMode)}
	onOpenChange={(open) => !open && (textDialogMode = null)}
>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={submitTextDialog}>
			<Dialog.Header>
				<Dialog.Title
					>{textDialogMode === 'create-notebook'
						? 'New notebook'
						: textDialogMode === 'create-page'
							? 'New page'
							: `Rename ${renameTarget?.kind ?? 'item'}`}</Dialog.Title
				>
				<Dialog.Description>Choose a clear, descriptive title.</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="notebook-title-dialog">Title</Label><Input
					id="notebook-title-dialog"
					bind:value={textDialogValue}
					autofocus
				/>
			</div>
			<Dialog.Footer
				><Button variant="outline" onclick={() => (textDialogMode = null)}>Cancel</Button><Button
					type="submit">Save</Button
				></Dialog.Footer
			>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root
	open={Boolean(movePageTarget)}
	onOpenChange={(open) => !open && (movePageTarget = null)}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Move {movePageTarget?.title ?? 'page'}</Dialog.Title>
			<Dialog.Description>Choose another notebook for this page and its notes.</Dialog.Description>
		</Dialog.Header>
		<select class="dk-field h-9 px-3 text-sm" bind:value={moveDestinationId}>
			{#each notebooksStore.notebooks.filter(({ id }) => id !== notebooksStore.activeNotebookId) as notebook (notebook.id)}
				<option value={notebook.id}>{notebook.title}</option>
			{/each}
		</select>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (movePageTarget = null)}>Cancel</Button>
			<Button disabled={!moveDestinationId} onclick={() => void movePage()}>Move page</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<NotebookSearchDialog
	open={notebookSearchOpen}
	notebooks={notebooksStore.notebooks}
	onOpenChange={(open) => (notebookSearchOpen = open)}
	onOpenResult={openSearchResult}
/>

<NotebookExportDialog
	open={notebookExportOpen}
	pages={notebooksStore.activeNotebook?.pages ?? []}
	onOpenChange={(open) => (notebookExportOpen = open)}
	onExport={exportNotebook}
	onMasterCorpus={addToMasterCorpus}
/>

<DialogConfirmation
	open={Boolean(deleteTarget)}
	description={deleteTarget?.detail ?? ''}
	confirmLabel={`Delete ${deleteTarget?.kind ?? 'item'}`}
	onOpenChange={(open) => !open && (deleteTarget = null)}
	onConfirm={confirmDelete}
/>
