<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Input } from '$lib/components/ui/input';
	import type { NotebookSourceItem } from '$lib/types';
	import NotebookHeaderActions from './NotebookHeaderActions.svelte';
	import type { NotebookView } from './notebook-types';

	interface Props {
		collectionImportSupported?: boolean;
		findOpen?: boolean;
		importing?: boolean;
		onBack: () => void;
		onClearSources: () => Promise<void> | void;
		onCreate: () => void;
		onImport: () => Promise<void> | void;
		onInsertCitation: (source: NotebookSourceItem) => Promise<void> | void;
		onInsertCitationsTable: () => Promise<void> | void;
		onRemoveSource: (id: string) => Promise<void> | void;
		onRenameTitle: (title: string) => Promise<void> | void;
		onToggleFind?: () => void;
		sources: readonly NotebookSourceItem[];
		sourcesLoading?: boolean;
		title: string;
		view: NotebookView;
	}

	let {
		collectionImportSupported = true,
		findOpen = false,
		importing = false,
		onBack,
		onClearSources,
		onCreate,
		onImport,
		onInsertCitation,
		onInsertCitationsTable,
		onRemoveSource,
		onRenameTitle,
		onToggleFind = () => {},
		sources,
		sourcesLoading = false,
		title,
		view
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	const editLabel = $derived(view === 'pages' ? 'Notebook title' : 'Page title');

	$effect(() => {
		input?.focus();
		input?.select();
	});

	function startEditing(): void {
		if (view === 'notebooks') return;
		draft = title;
		editing = true;
	}

	async function commit(): Promise<void> {
		if (!editing) return;
		editing = false;
		const value = draft.trim();
		if (!value || value === title) return;
		await onRenameTitle(value);
	}

	function submitTitle(event: SubmitEvent): void {
		event.preventDefault();
		void commit();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		editing = false;
	}
</script>

<header class="flex h-11 items-center gap-2 border-b bg-card/70 px-3">
	{#if view !== 'notebooks'}
		<ActionIcon
			class="size-8"
			label={view === 'editor' ? 'Back to pages' : 'Back to notebooks'}
			onclick={onBack}
			variant="ghost"><ArrowLeft /></ActionIcon
		>
	{/if}
	{#if editing}
		<form class="min-w-0 flex-1" onsubmit={submitTitle}>
			<Input
				aria-label={editLabel}
				bind:ref={input}
				bind:value={draft}
				class="h-8 text-sm font-semibold"
				onblur={() => void commit()}
				onkeydown={handleKeydown}
			/>
		</form>
	{:else if view === 'notebooks'}
		<h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
	{:else}
		<button
			class="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onclick={startEditing}
			type="button">{title}</button
		>
	{/if}
	<NotebookHeaderActions
		{collectionImportSupported}
		{findOpen}
		{importing}
		{onClearSources}
		{onCreate}
		{onImport}
		{onInsertCitation}
		{onInsertCitationsTable}
		{onRemoveSource}
		{onToggleFind}
		{sources}
		{sourcesLoading}
		{view}
	/>
</header>
