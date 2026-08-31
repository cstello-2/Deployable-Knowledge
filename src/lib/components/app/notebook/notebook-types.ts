export type ReorderHandleProps = Record<string, unknown> & {
	'aria-keyshortcuts': string;
	onkeydown: (event: KeyboardEvent) => void;
	onpointercancel: (event: PointerEvent) => void;
	onpointerdown: (event: PointerEvent) => void;
	onpointermove: (event: PointerEvent) => void;
	onpointerup: (event: PointerEvent) => void;
};

export type NotebookView = 'notebooks' | 'pages' | 'editor';
export type NotebookRenameTarget = { kind: 'notebook' | 'page'; id: string; title: string };
export type NotebookDeleteTarget = {
	kind: 'notebook' | 'page';
	id: string;
	title: string;
	detail: string;
};
