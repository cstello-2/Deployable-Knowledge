import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { SourceTypeHandler } from './source-types';

export function managedExtensionFor(handler: SourceTypeHandler, name: string): string {
	return handler.convert?.extension ?? extname(name).toLowerCase();
}

export function previewPathFor(managedPath: string): string {
	const extension = extname(managedPath);
	return `${managedPath.slice(0, managedPath.length - extension.length)}.preview.pdf`;
}

export async function writeManagedArtifacts(
	handler: SourceTypeHandler,
	originalBuffer: Buffer,
	managedPath: string
): Promise<void> {
	const artifact = handler.convert ? await handler.convert.run(originalBuffer) : originalBuffer;
	await writeFile(managedPath, artifact);

	if (!handler.preview) return;
	try {
		await writeFile(previewPathFor(managedPath), await handler.preview.run(originalBuffer));
	} catch (error) {
		console.warn(`[Documents] Could not write the preview PDF for ${managedPath}.`, error);
	}
}
