import type { NotebookWithPages } from '$lib/types';

function heading(title: string): string {
	return title.replace(/\s+/g, ' ').trim();
}

export function notebookMarkdown(notebook: NotebookWithPages): string {
	const sections = [`# ${heading(notebook.title)}`];
	for (const page of notebook.pages) {
		sections.push(`## ${heading(page.title)}`, page.content.trimEnd());
	}
	return `${sections.join('\n\n').trimEnd()}\n`;
}

export function notebookMarkdownFilename(title: string): string {
	const base =
		title
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80)
			.replace(/-+$/g, '') || 'notebook';
	return `${base}.md`;
}
