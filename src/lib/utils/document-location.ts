import type { Document } from '$lib/types';

export function describeDocumentLocation(
	sourceType: Document['sourceType'] | undefined,
	pageIndex: number
): string {
	if (sourceType === 'AUDIO' || sourceType === 'YOUTUBE') return 'Transcript';
	if (sourceType === 'XLSX') return `Sheet ${pageIndex + 1}`;
	return `Page ${pageIndex + 1}`;
}
