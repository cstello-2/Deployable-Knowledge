export function countNotebookText(pages: ReadonlyArray<{ content: string }>): number {
	return pages.reduce((total, page) => total + page.content.length, 0);
}
