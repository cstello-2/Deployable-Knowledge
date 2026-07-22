export function notebookPagePreview(content: string, maxLength = 100): string {
	const compact = content.replace(/\s+/g, ' ').trim();
	if (!compact) return 'Empty page';
	return compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}…` : compact;
}

export function notebookCountLabel(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
