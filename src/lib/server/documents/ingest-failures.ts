import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { ingestFailures, type IngestFailure } from '$lib/server/database/schema';

export type IngestStageError = Error & { stage?: string };

export async function recordIngestFailure(input: {
	sourcePath: string;
	title: string;
	sourceType?: string;
	error: unknown;
}): Promise<void> {
	const error = input.error;
	const message = error instanceof Error ? error.message : String(error);
	const stage = error instanceof Error ? (error as IngestStageError).stage : undefined;
	const stack =
		error instanceof Error
			? ((error.cause instanceof Error ? error.cause.stack : error.stack) ?? null)
			: null;

	await db.insert(ingestFailures).values({
		id: randomUUID(),
		sourcePath: input.sourcePath,
		title: input.title,
		sourceType: input.sourceType ?? null,
		stage: stage ?? null,
		message,
		stack,
		createdAt: new Date().toISOString()
	});
}

// Called whenever a source path ingests successfully, so a fixed file doesn't keep
// showing up as failed forever.
export async function clearIngestFailures(sourcePath: string): Promise<void> {
	await db.delete(ingestFailures).where(eq(ingestFailures.sourcePath, sourcePath));
}

export async function listIngestFailures(): Promise<IngestFailure[]> {
	return db.select().from(ingestFailures).orderBy(desc(ingestFailures.createdAt));
}

export async function deleteIngestFailure(id: string): Promise<void> {
	await db.delete(ingestFailures).where(eq(ingestFailures.id, id));
}

export async function clearAllIngestFailures(): Promise<void> {
	await db.delete(ingestFailures);
}
