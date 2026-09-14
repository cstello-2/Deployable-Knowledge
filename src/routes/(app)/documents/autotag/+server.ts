import { error } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import type { ApiDocumentAutotagEvent } from '$lib/types';
import { db } from '$lib/server/database/database';
import { tags } from '$lib/server/database/schema';
import { autotagDocuments } from '$lib/server/documents/autotag';
import { ndjsonTaskResponse } from '$lib/server/utils/ndjson-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { documentIds?: unknown } | null;
	const documentIds = body?.documentIds;
	if (
		!Array.isArray(documentIds) ||
		documentIds.length === 0 ||
		!documentIds.every((id) => typeof id === 'string')
	) {
		throw error(400, 'Choose at least one document to autotag.');
	}

	const tagNames = (await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name))).map(
		({ name }) => name
	);
	if (tagNames.length === 0) throw error(400, 'Create a tag first.');

	return ndjsonTaskResponse<ApiDocumentAutotagEvent>(
		'Autotagging',
		async (send) => {
			const result = await autotagDocuments(
				[...new Set(documentIds)],
				tagNames,
				(progress, entry) => send({ status: 'progress', ...progress, entry })
			);
			send({ status: 'complete', result });
		},
		(cause) => ({
			status: 'error',
			message: cause instanceof Error ? cause.message : 'Autotagging failed'
		})
	);
};
