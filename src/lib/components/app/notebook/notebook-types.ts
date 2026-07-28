export type NotebookView = 'notebooks' | 'pages' | 'editor';
export type NotebookRenameTarget = { kind: 'notebook' | 'page'; id: string; title: string };
export type NotebookDeleteTarget = {
	kind: 'notebook' | 'page';
	id: string;
	title: string;
	detail: string;
};
export type NotebookImportMode = 'collection' | 'pages';
