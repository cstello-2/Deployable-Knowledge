<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { EditorView } from '@codemirror/view';
	import { applyRibbonCommand, type RibbonCommand } from './notebook-editing';
	import { notebookEditorExtensions, setFindHighlights } from './notebook-codemirror';
	import NotebookEditorFindBar from './NotebookEditorFindBar.svelte';
	import NotebookEditorRibbon from './NotebookEditorRibbon.svelte';

	interface Props {
		atLimit?: boolean;
		characterCount: number;
		characterLimit: number;
		charactersRemaining: number;
		findOpen?: boolean;
		nearLimit?: boolean;
		notes: string;
		onInput: () => void;
		pageLimit: number;
	}

	let {
		atLimit = false,
		characterCount,
		characterLimit,
		charactersRemaining,
		findOpen = $bindable(false),
		nearLimit = false,
		notes = $bindable(),
		onInput,
		pageLimit
	}: Props = $props();

	const MAX_FIND_MATCHES = 500;

	let editorHost = $state<HTMLElement | null>(null);
	let editorView: EditorView | null = null;
	let applyingExternal = false;

	let findQuery = $state('');
	let activeMatchIndex = $state(0);

	// The find bar can also be toggled from the notebook header via the bound prop
	$effect(() => {
		if (findOpen) activeMatchIndex = 0;
	});

	const matches = $derived.by(() => {
		if (!findOpen || !findQuery.trim()) return [];
		const needle = findQuery.toLowerCase();
		const haystack = notes.toLowerCase();
		const positions: { start: number; end: number }[] = [];
		let index = haystack.indexOf(needle);
		while (index !== -1 && positions.length < MAX_FIND_MATCHES) {
			positions.push({ start: index, end: index + needle.length });
			index = haystack.indexOf(needle, index + Math.max(1, needle.length));
		}
		return positions;
	});
	const boundedMatchIndex = $derived(
		matches.length ? Math.min(activeMatchIndex, matches.length - 1) : 0
	);

	onMount(() => {
		editorView = new EditorView({
			parent: editorHost ?? undefined,
			doc: notes,
			extensions: [
				notebookEditorExtensions({
					characterLimit: () => pageLimit,
					onCommand: (command) => runCommand(command),
					onOpenFind: openFind,
					onEscape: () => {
						if (!findOpen) return false;
						closeFind();
						return true;
					}
				}),
				EditorView.updateListener.of((update) => {
					if (!update.docChanged || applyingExternal) return;
					notes = update.state.doc.toString();
					onInput();
				})
			]
		});
	});

	onDestroy(() => editorView?.destroy());

	// Push external notes changes (page switch, citation insertion) into the editor
	$effect(() => {
		const value = notes;
		const view = editorView;
		if (!view) return;
		const current = view.state.doc.toString();
		if (value === current) return;
		applyingExternal = true;
		view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
		applyingExternal = false;
	});

	// Mirror find matches into the editor's highlight decorations
	$effect(() => {
		const spec = { ranges: findOpen ? matches : [], current: boundedMatchIndex };
		editorView?.dispatch({ effects: setFindHighlights.of(spec) });
	});

	function limitSuffix(): string {
		if (atLimit) return ' · limit reached';
		if (nearLimit) return ` · ${charactersRemaining.toLocaleString()} remaining`;
		return '';
	}

	function runCommand(command: RibbonCommand): void {
		const view = editorView;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const text = view.state.doc.toString();
		const result = applyRibbonCommand(text, { start: from, end: to }, command);
		if (result.text.length > pageLimit) return;
		view.dispatch({
			changes: { from: 0, to: text.length, insert: result.text },
			selection: { anchor: result.start, head: result.end },
			scrollIntoView: true
		});
		view.focus();
	}

	function openFind(): void {
		findOpen = true;
	}

	function closeFind(): void {
		findOpen = false;
		editorView?.focus();
	}

	function setQuery(value: string): void {
		findQuery = value;
		activeMatchIndex = 0;
	}

	function gotoMatch(delta: number): void {
		if (!matches.length) return;
		activeMatchIndex = (boundedMatchIndex + delta + matches.length) % matches.length;
		const match = matches[activeMatchIndex];
		editorView?.dispatch({
			selection: { anchor: match.start, head: match.end },
			effects: EditorView.scrollIntoView(match.start, { y: 'center' })
		});
	}

	// Exposed to NotebookWindow so citation insertion works in whole-page offsets.
	export function getSelection(): { start: number; end: number } {
		const view = editorView;
		if (!view) return { start: notes.length, end: notes.length };
		const { from, to } = view.state.selection.main;
		return { start: from, end: to };
	}

	export function focusAt(cursor: number): void {
		const view = editorView;
		if (!view) return;
		const position = Math.max(0, Math.min(cursor, view.state.doc.length));
		view.dispatch({
			selection: { anchor: position },
			effects: EditorView.scrollIntoView(position, { y: 'center' })
		});
		view.focus();
	}
</script>

<div class="grid min-h-0 grid-rows-[auto_1fr]">
	<NotebookEditorRibbon onCommand={runCommand} />
	<div class="relative min-h-0">
		<div bind:this={editorHost} class="h-full min-h-0" aria-label="Notebook notes"></div>
		{#if findOpen}
			<div class="absolute right-3 bottom-8 z-10">
				<NotebookEditorFindBar
					activeIndex={matches.length ? boundedMatchIndex + 1 : 0}
					count={matches.length}
					onClose={closeFind}
					onNext={() => gotoMatch(1)}
					onPrev={() => gotoMatch(-1)}
					bind:query={() => findQuery, setQuery}
				/>
			</div>
		{/if}
		<div
			class={[
				'pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground',
				nearLimit && !atLimit && 'text-amber-600 dark:text-amber-400',
				atLimit && 'text-destructive'
			]}
			role="status"
			aria-live="polite"
		>
			{characterCount.toLocaleString()} / {characterLimit.toLocaleString()} characters{limitSuffix()}
		</div>
	</div>
</div>
