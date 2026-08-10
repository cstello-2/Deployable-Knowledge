// CodeMirror configuration for the notebook's live-preview editor: one
// continuous editing surface where markdown renders styled in place and the
// syntax marks (**, #, color spans…) only reveal themselves around the cursor.

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	EditorView,
	keymap,
	placeholder,
	ViewPlugin,
	type ViewUpdate
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { RibbonCommand } from './notebook-editing';

export interface NotebookEditorHooks {
	characterLimit(): number;
	onCommand(command: RibbonCommand): void;
	onOpenFind(): void;
	onEscape(): boolean;
}

const HIDE = Decoration.replace({});

// Only color values our ribbon writes (or close cousins) get styled; anything
// else stays plain source so arbitrary CSS never reaches the editor DOM.
const COLOR_SPAN =
	/<span style="color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,25})\s*;?\s*">((?:(?!<\/?span)[\s\S])*?)<\/span>/g;

interface PendingDecoration {
	from: number;
	to: number;
	deco: Decoration;
}

function buildLivePreview(view: EditorView): DecorationSet {
	const { state } = view;
	const selection = state.selection.main;
	const touches = (from: number, to: number) => selection.to >= from && selection.from <= to;
	const pending: PendingDecoration[] = [];
	const hide = (from: number, to: number) => {
		if (to > from) pending.push({ from, to, deco: HIDE });
	};

	for (const range of view.visibleRanges) {
		syntaxTree(state).iterate({
			from: range.from,
			to: range.to,
			enter: (node) => {
				const parent = node.node.parent;
				switch (node.name) {
					case 'HeaderMark': {
						if (!parent || touches(parent.from, parent.to)) return;
						const after = state.doc.sliceString(node.to, node.to + 1);
						hide(node.from, node.to + (after === ' ' ? 1 : 0));
						return;
					}
					case 'EmphasisMark':
					case 'StrikethroughMark': {
						if (!parent || touches(parent.from, parent.to)) return;
						hide(node.from, node.to);
						return;
					}
					case 'InlineCode': {
						pending.push({
							from: node.from,
							to: node.to,
							deco: Decoration.mark({ class: 'nb-inline-code' })
						});
						return;
					}
					case 'FencedCode': {
						const open = state.doc.lineAt(node.from);
						const close = state.doc.lineAt(node.to);
						for (let lineNumber = open.number; lineNumber <= close.number; lineNumber += 1) {
							const line = state.doc.line(lineNumber);
							let lineClass = 'nb-codeblock';
							if (lineNumber === open.number) lineClass += ' nb-codeblock-first';
							if (lineNumber === close.number) lineClass += ' nb-codeblock-last';
							pending.push({
								from: line.from,
								to: line.from,
								deco: Decoration.line({ class: lineClass })
							});
						}
						// With the cursor outside, the fence lines collapse into the
						// block's top and bottom padding
						const closed = node.node.getChildren('CodeMark').length >= 2;
						if (closed && close.number > open.number && !touches(node.from, node.to)) {
							hide(node.from, open.to);
							hide(close.from, node.to);
						}
						return;
					}
					case 'CodeMark': {
						if (parent?.name !== 'InlineCode' || touches(parent.from, parent.to)) return;
						hide(node.from, node.to);
						return;
					}
					case 'Link':
					case 'Image': {
						if (touches(node.from, node.to)) return false;
						for (const mark of node.node.getChildren('LinkMark')) hide(mark.from, mark.to);
						for (const url of node.node.getChildren('URL')) hide(url.from, url.to);
						for (const title of node.node.getChildren('LinkTitle')) hide(title.from, title.to);
						return false;
					}
				}
			}
		});
		collectColorSpans(state, range.from, range.to, touches, pending);
	}

	return Decoration.set(
		pending.map(({ from, to, deco }) => deco.range(from, to)),
		true
	);
}

function collectColorSpans(
	state: EditorState,
	from: number,
	to: number,
	touches: (from: number, to: number) => boolean,
	pending: PendingDecoration[]
): void {
	const text = state.doc.sliceString(from, to);
	COLOR_SPAN.lastIndex = 0;
	for (let match; (match = COLOR_SPAN.exec(text)); ) {
		const start = from + match.index;
		const end = start + match[0].length;
		const openEnd = start + match[0].indexOf('>') + 1;
		const closeStart = end - '</span>'.length;
		if (openEnd < closeStart) {
			pending.push({
				from: openEnd,
				to: closeStart,
				deco: Decoration.mark({ attributes: { style: `color:${match[1]}` } })
			});
		}
		if (!touches(start, end)) {
			pending.push({ from: start, to: openEnd, deco: HIDE });
			pending.push({ from: closeStart, to: end, deco: HIDE });
		}
	}
}

const livePreviewPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildLivePreview(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildLivePreview(update.view);
			}
		}
	},
	{ decorations: (value) => value.decorations }
);

const findMatchDeco = Decoration.mark({ class: 'nb-find-match' });
const findCurrentDeco = Decoration.mark({ class: 'nb-find-current' });

export interface FindHighlightSpec {
	ranges: { start: number; end: number }[];
	current: number;
}

export const setFindHighlights = StateEffect.define<FindHighlightSpec>();

export const findHighlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		let next = value.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (!effect.is(setFindHighlights)) continue;
			const { ranges, current } = effect.value;
			next = Decoration.set(
				ranges
					.filter((range) => range.end > range.start)
					.map((range, index) =>
						(index === current ? findCurrentDeco : findMatchDeco).range(range.start, range.end)
					),
				true
			);
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field)
});

const markdownHighlighting = HighlightStyle.define([
	{ tag: tags.heading1, fontSize: '1.55em', fontWeight: '700' },
	{ tag: tags.heading2, fontSize: '1.35em', fontWeight: '700' },
	{ tag: tags.heading3, fontSize: '1.2em', fontWeight: '600' },
	{ tag: tags.heading4, fontSize: '1.1em', fontWeight: '600' },
	{ tag: tags.heading5, fontWeight: '600' },
	{ tag: tags.heading6, fontWeight: '600', color: 'var(--color-muted-foreground)' },
	{ tag: tags.strong, fontWeight: '700' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	{
		tag: tags.monospace,
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		fontSize: '0.9em'
	},
	{ tag: tags.link, color: 'var(--color-primary)', textDecoration: 'underline' },
	{ tag: tags.url, color: 'var(--color-muted-foreground)' },
	{ tag: tags.quote, color: 'var(--color-muted-foreground)', fontStyle: 'italic' },
	{ tag: tags.processingInstruction, color: 'var(--color-muted-foreground)' },
	{ tag: tags.meta, color: 'var(--color-muted-foreground)' },
	{ tag: tags.contentSeparator, color: 'var(--color-muted-foreground)' }
]);

const editorTheme = EditorView.theme({
	'&': { height: '100%', fontSize: '0.875rem', backgroundColor: 'transparent', color: 'inherit' },
	'.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.7', overflow: 'auto' },
	'.cm-content': { padding: '0.75rem 1rem 2.25rem' },
	'&.cm-focused': { outline: 'none' },
	'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
		backgroundColor: 'color-mix(in oklab, var(--color-primary) 25%, transparent)'
	},
	'.cm-cursor': { borderLeftColor: 'currentColor' },
	'.cm-placeholder': { color: 'var(--color-muted-foreground)' },
	'.nb-find-match': { backgroundColor: 'color-mix(in oklab, #facc15 35%, transparent)' },
	'.nb-find-current': { backgroundColor: 'color-mix(in oklab, #f97316 60%, transparent)' },
	'.nb-inline-code': {
		backgroundColor: 'color-mix(in oklab, var(--color-muted) 70%, transparent)',
		borderRadius: '4px',
		padding: '0.08em 0.3em'
	},
	'.nb-codeblock': {
		backgroundColor: 'color-mix(in oklab, var(--color-muted) 55%, transparent)',
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		fontSize: '0.875em',
		padding: '0 0.75rem'
	},
	'.nb-codeblock-first': { borderRadius: '8px 8px 0 0' },
	'.nb-codeblock-last': { borderRadius: '0 0 8px 8px' }
});

export function notebookEditorExtensions(hooks: NotebookEditorHooks): Extension {
	return [
		history(),
		drawSelection(),
		EditorView.lineWrapping,
		placeholder('Write notes here…'),
		markdown({ base: markdownLanguage }),
		syntaxHighlighting(markdownHighlighting),
		livePreviewPlugin,
		findHighlightField,
		editorTheme,
		EditorState.changeFilter.of(
			(transaction) =>
				!transaction.docChanged || transaction.newDoc.length <= hooks.characterLimit()
		),
		keymap.of([
			{
				key: 'Mod-f',
				run: () => {
					hooks.onOpenFind();
					return true;
				}
			},
			{
				key: 'Mod-b',
				run: () => {
					hooks.onCommand('bold');
					return true;
				}
			},
			{
				key: 'Mod-i',
				run: () => {
					hooks.onCommand('italic');
					return true;
				}
			},
			{ key: 'Escape', run: () => hooks.onEscape() },
			...historyKeymap,
			...defaultKeymap
		])
	];
}
