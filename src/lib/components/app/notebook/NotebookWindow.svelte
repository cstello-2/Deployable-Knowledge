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
	import type {
		ApiDocumentDirectoryResponse,
		NotebookPage,
		NotebookSourceItem,
		NotebookWithPages
	} from '$lib/types';
	import { createNotebookAutosave } from './notebook-autosave';
	import { notebookCountLabel } from './notebook-format';
	import type {
		NotebookDeleteTarget,
		NotebookRenameTarget,
		NotebookView,
		NotebookImportMode
	} from './notebook-types';
	import NotebookEditor from './NotebookEditor.svelte';
	import NotebookHeader from './NotebookHeader.svelte';
	import NotebookList from './NotebookList.svelte';
	import NotebookPageList from './NotebookPageList.svelte';
	import NotebookPreview from './NotebookPreview.svelte';
	import NotebookImportDialog from './NotebookImportDialog.svelte';
	import NotebookPageSearch from './NotebookPageSearch.svelte';
	import NotebookSearch from './NotebookSearch.svelte';
	import type { NotebookSearchResult } from './notebook-search';
	import { insertNotebookSourceCitation } from '$lib/utils/notebook-citations';
	import {
		lineAtPreviewScrollTop,
		lineAtTextareaScrollTop,
		scrollPreviewToLine,
		scrollTextareaToLine
	} from '$lib/utils/scroll-line-sync';

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
	let notesTextarea = $state<HTMLTextAreaElement | null>(null);
	let notesPreviewViewport = $state<HTMLDivElement | null>(null);
	let pageSearchOpen = $state(false);
	let pageSearchQuery = $state('');
	let pageSearchIndex = $state(0);
	let rootElement = $state<HTMLDivElement | null>(null);
	let importDialogOpen = $state(false);
	let importDirectory = $state<ApiDocumentDirectoryResponse | null>(null);
	let importLoading = $state(false);
	let importing = $state(false);
	let importMode = $state<NotebookImportMode>('collection');
	let importSelectedPaths = $state<string[]>([]);

	function textDialogTitle(): string {
		if (textDialogMode === 'create-notebook') return 'New notebook';
		if (textDialogMode === 'create-page') return 'New page';
		return `Rename ${renameTarget?.kind ?? 'item'}`;
	}

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

	// Ctrl/Cmd+F only makes sense to intercept while focus is somewhere inside this
	// window - browser find-in-page can't search inside a <textarea> anyway, and
	// scoping the listener to this element (rather than window) leaves the shortcut
	// alone everywhere else in the app. Escape lives here too, not just in
	// NotebookPageSearch's own bar, because jumping to a match moves focus into the
	// textarea/preview - outside the search bar - so a listener scoped to the bar
	// alone would stop seeing Escape the moment you navigate to a result.
	onMount(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			if (
				(event.ctrlKey || event.metaKey) &&
				event.key.toLowerCase() === 'f' &&
				view === 'editor'
			) {
				event.preventDefault();
				pageSearchOpen = true;
			} else if (event.key === 'Escape' && pageSearchOpen) {
				event.preventDefault();
				closePageSearch();
			}
		};
		rootElement?.addEventListener('keydown', handleKeydown);
		return () => rootElement?.removeEventListener('keydown', handleKeydown);
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

	async function moveNotebook(notebookId: string, targetIndex: number): Promise<void> {
		try {
			await notebooksStore.moveNotebook(notebookId, targetIndex);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function reorderPage(pageId: string, targetIndex: number): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook) return;

		try {
			await notebooksStore.reorderPage(notebook.id, pageId, targetIndex);
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

	async function openSearchResult(result: NotebookSearchResult): Promise<void> {
		await autosave.flush();
		try {
			if (result.notebookId !== notebooksStore.activeNotebookId) {
				await notebooksStore.select(result.notebookId);
			}
			await notebooksStore.selectPage(result.notebookId, result.pageId);
			view = 'editor';
			previewMode = false;
		} catch (error) {
			toast.error(message(error));
		}
	}

	function openMovePage(page: NotebookPage): void {
		movePageTarget = page;
		moveDestinationId =
			notebooksStore.notebooks.find(({ id }) => id !== notebooksStore.activeNotebookId)?.id ?? '';
	}

	async function movePageToNotebook(): Promise<void> {
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

	async function prepareExport(): Promise<boolean> {
		await autosave.flush();
		if (notes === lastSavedNotes) return true;
		toast.error('Save the current page before exporting.');
		return false;
	}

	async function exportNotebook(notebook: NotebookWithPages): Promise<void> {
		if (!(await prepareExport())) return;
		try {
			const filename = await notebooksStore.exportNotebook(notebook.id);
			if (filename) toast.success(`Exported ${filename}`);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function addNotebookToMasterCorpus(notebook: NotebookWithPages): Promise<void> {
		if (!(await prepareExport())) return;
		try {
			const result = await notebooksStore.addToMasterCorpus(
				notebook.id,
				notebook.pages.map((page) => page.id)
			);
			if (!result) return;
			await documentsStore.load();
			toast.success(
				`Added ${result.pageCount} page${result.pageCount === 1 ? '' : 's'} to the search index as ${result.chunkCount} chunk${result.chunkCount === 1 ? '' : 's'}`
			);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function exportPage(page: NotebookPage): Promise<void> {
		const notebook = notebooksStore.activeNotebook;
		if (!notebook || !(await prepareExport())) return;
		try {
			const filename = await notebooksStore.exportPage(notebook.id, page.id);
			if (filename) toast.success(`Exported ${filename}`);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function openImportDialog(): Promise<void> {
		importMode = view === 'notebooks' ? 'collection' : 'pages';

		if (importMode === 'pages') {
			if (!notebooksStore.activeNotebook) {
				toast.error('Open a notebook before importing pages.');
				return;
			}

			await autosave.flush();

			if (notes !== lastSavedNotes) {
				toast.error('Save the current page before importing.');
				return;
			}
		}

		importDialogOpen = true;
		importSelectedPaths = [];
		await navigateImportDirectory('');
	}

	async function navigateImportDirectory(path: string): Promise<void> {
		importLoading = true;
		importSelectedPaths = [];

		try {
			importDirectory = await notebooksStore.browseImportDirectory(path);
		} catch (error) {
			toast.error(message(error));
		} finally {
			importLoading = false;
		}
	}

	async function importPaths(paths: string[]): Promise<void> {
		if (!paths.length) return;

		importing = true;

		try {
			if (importMode === 'collection') {
				await notebooksStore.importCollection(paths[0]);
				view = 'pages';
				toast.success('Notebook collection imported');
			} else {
				for (const path of paths) {
					await notebooksStore.importMarkdown(path);
				}

				toast.success(`${paths.length} notebook page${paths.length === 1 ? '' : 's'} imported`);
			}

			importDialogOpen = false;
			importSelectedPaths = [];
		} catch (error) {
			toast.error(message(error));
		} finally {
			importing = false;
		}
	}

	// Keep the edit/preview toggle on the same part of the document instead of
	// jumping to the top, by matching source line rather than scroll fraction
	// (rendered HTML doesn't scale 1:1 with raw line count).
	async function togglePreviewMode(): Promise<void> {
		if (!previewMode) {
			const line = notesTextarea ? lineAtTextareaScrollTop(notesTextarea, notes) : 0;
			previewMode = true;
			await tick();
			if (notesPreviewViewport) scrollPreviewToLine(notesPreviewViewport, line);
		} else {
			const line = notesPreviewViewport ? lineAtPreviewScrollTop(notesPreviewViewport) : 0;
			previewMode = false;
			await tick();
			if (notesTextarea) scrollTextareaToLine(notesTextarea, notes, line);
		}
	}

	type PageSearchMatch = { start: number; end: number; line: number };

	function findPageSearchMatches(text: string, query: string): PageSearchMatch[] {
		const trimmed = query.trim();
		if (!trimmed) return [];

		const matches: PageSearchMatch[] = [];
		const lowerText = text.toLowerCase();
		const lowerQuery = trimmed.toLowerCase();
		let fromIndex = 0;
		let found = lowerText.indexOf(lowerQuery, fromIndex);
		while (found !== -1) {
			const line = text.slice(0, found).split('\n').length - 1;
			matches.push({ start: found, end: found + trimmed.length, line });
			fromIndex = found + trimmed.length;
			found = lowerText.indexOf(lowerQuery, fromIndex);
		}
		return matches;
	}

	const pageSearchMatches = $derived(findPageSearchMatches(notes, pageSearchQuery));

	// Jump to the first match whenever the query (or its results) change, rather
	// than leaving the index pointing at a match that no longer exists.
	$effect(() => {
		pageSearchIndex = 0;
		if (pageSearchMatches.length) void jumpToPageSearchMatch(0);
	});

	async function jumpToPageSearchMatch(index: number): Promise<void> {
		const match = pageSearchMatches[index];
		if (!match) return;
		await tick();
		if (previewMode) {
			if (notesPreviewViewport) scrollPreviewToLine(notesPreviewViewport, match.line);
		} else if (notesTextarea) {
			notesTextarea.focus();
			notesTextarea.setSelectionRange(match.start, match.end);
			scrollTextareaToLine(notesTextarea, notes, match.line);
		}
	}

	function nextPageSearchMatch(): void {
		if (!pageSearchMatches.length) return;
		pageSearchIndex = (pageSearchIndex + 1) % pageSearchMatches.length;
		void jumpToPageSearchMatch(pageSearchIndex);
	}

	function prevPageSearchMatch(): void {
		if (!pageSearchMatches.length) return;
		pageSearchIndex = (pageSearchIndex - 1 + pageSearchMatches.length) % pageSearchMatches.length;
		void jumpToPageSearchMatch(pageSearchIndex);
	}

	function togglePageSearch(): void {
		pageSearchOpen = !pageSearchOpen;
		if (!pageSearchOpen) pageSearchQuery = '';
	}

	function closePageSearch(): void {
		pageSearchOpen = false;
		pageSearchQuery = '';
		notesTextarea?.focus();
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
	<div
		bind:this={rootElement}
		class="grid h-full min-h-0 grid-rows-[auto_auto_1fr] overflow-hidden"
	>
		<NotebookHeader
			{importing}
			onBack={goBack}
			onClearSources={clearSources}
			onCreate={openCreate}
			onImport={openImportDialog}
			onInsertCitation={insertCitation}
			onRemoveSource={removeSource}
			onToggleSearch={togglePageSearch}
			onTogglePreview={() => void togglePreviewMode()}
			{previewMode}
			searchOpen={pageSearchOpen}
			sources={notebooksStore.sources}
			sourcesLoading={notebooksStore.sourcesLoading}
			title={headerTitle()}
			{view}
		/>
		{#if pageSearchOpen && view === 'editor'}
			<NotebookPageSearch
				bind:query={pageSearchQuery}
				currentIndex={pageSearchIndex}
				matchCount={pageSearchMatches.length}
				onClose={closePageSearch}
				onNext={nextPageSearchMatch}
				onPrev={prevPageSearchMatch}
			/>
		{/if}
		<div class="row-start-3 grid min-h-0 min-w-0 overflow-hidden">
			{#if view === 'notebooks'}
				<NotebookSearch
					notebooks={notebooksStore.notebooks}
					onOpenResult={openSearchResult}
					placeholder="Search notebooks..."
				>
					<NotebookList
						activeId={notebooksStore.activeNotebookId}
						addingToMasterCorpusId={notebooksStore.addingToMasterCorpusId}
						exportDisabled={notebooksStore.exportingNotebookId !== null ||
							notebooksStore.exportingPageId !== null}
						exportingId={notebooksStore.exportingNotebookId}
						notebooks={notebooksStore.notebooks}
						onAddToMasterCorpus={(notebook) => void addNotebookToMasterCorpus(notebook)}
						onDelete={openDeleteNotebook}
						onExport={(notebook) => void exportNotebook(notebook)}
						onMove={moveNotebook}
						onOpen={(notebook) => void openNotebook(notebook)}
						onRename={(notebook) => openRename(notebook, 'notebook')}
						reorderDisabled={notebooksStore.reordering}
					/>
				</NotebookSearch>
			{:else if view === 'pages'}
				<NotebookSearch
					notebooks={notebooksStore.activeNotebook ? [notebooksStore.activeNotebook] : []}
					onOpenResult={openSearchResult}
					placeholder="Search pages..."
				>
					<NotebookPageList
						activeId={notebooksStore.activePage?.id ?? null}
						exportDisabled={notebooksStore.exportingNotebookId !== null ||
							notebooksStore.exportingPageId !== null}
						exportingId={notebooksStore.exportingPageId}
						onDelete={openDeletePage}
						onExport={(page) => void exportPage(page)}
						onMove={openMovePage}
						onOpen={(page) => void openPage(page)}
						onRename={(page) => openRename(page, 'page')}
						onReorder={reorderPage}
						pages={notebooksStore.activeNotebook?.pages ?? []}
						reorderDisabled={notebooksStore.reordering}
					/>
				</NotebookSearch>
			{:else if previewMode}
				<NotebookPreview content={notes} bind:viewportRef={notesPreviewViewport} />
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
	</div>
</WorkspaceWindow>

<NotebookImportDialog
	directory={importDirectory}
	disabled={importing}
	loading={importLoading}
	mode={importMode}
	onImportFolder={(path) => void importPaths([path])}
	onNavigate={(path) => void navigateImportDirectory(path)}
	onOpenChange={(open) => (importDialogOpen = open)}
	onSelectedPathsChange={(paths) => (importSelectedPaths = paths)}
	onSubmitPaths={(paths) => void importPaths(paths)}
	open={importDialogOpen}
	selectedPaths={importSelectedPaths}
/>

<Dialog.Root
	open={Boolean(textDialogMode)}
	onOpenChange={(open) => !open && (textDialogMode = null)}
>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={submitTextDialog}>
			<Dialog.Header>
				<Dialog.Title>{textDialogTitle()}</Dialog.Title>
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
			<Button disabled={!moveDestinationId} onclick={() => void movePageToNotebook()}
				>Move page</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<DialogConfirmation
	open={Boolean(deleteTarget)}
	description={deleteTarget?.detail ?? ''}
	confirmLabel={`Delete ${deleteTarget?.kind ?? 'item'}`}
	onOpenChange={(open) => !open && (deleteTarget = null)}
	onConfirm={confirmDelete}
/>
