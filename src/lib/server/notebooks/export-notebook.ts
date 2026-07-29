import AdmZip from 'adm-zip';
import type { NotebookPage, NotebookWithPages } from '$lib/types';

function filenameBase(title: string, fallback: string): string {
	return (
		title
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80)
			.replace(/-+$/g, '') || fallback
	);
}

export function notebookPageMarkdown(page: Pick<NotebookPage, 'content' | 'title'>): string {
	const content = page.content.trimEnd();
	return content ? `${content}\n` : '';
}

export function notebookPageMarkdownFilename(title: string): string {
	return `${filenameBase(title, 'notebook-page')}.md`;
}

export function notebookZip(notebook: NotebookWithPages): ArrayBuffer {
	const archive = new AdmZip();
	const usedNames = new Set<string>();

	notebook.pages.forEach((page, index) => {
		const base = filenameBase(page.title, `page-${index + 1}`);
		let filename = `${base}.md`;
		let suffix = 2;

		while (usedNames.has(filename.toLowerCase())) {
			filename = `${base}-${suffix}.md`;
			suffix += 1;
		}

		usedNames.add(filename.toLowerCase());

		archive.addFile(filename, Buffer.from(notebookPageMarkdown(page), 'utf8'));
	});

	return Uint8Array.from(archive.toBuffer()).buffer;
}

export function notebookZipFilename(title: string): string {
	return `${filenameBase(title, 'notebook')}.zip`;
}
