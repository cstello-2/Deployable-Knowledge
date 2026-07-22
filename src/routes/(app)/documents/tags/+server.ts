import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ApiDocumentTagAssignmentRequest, ApiDocumentTagRequest } from '$lib/types';
import { DOCUMENT_TAG_PATTERN, normalizeDocumentTag } from '$lib/utils';
import { db } from '$lib/server/database/database';
import { documentTags, tags } from '$lib/server/database/schema';

async function listTags(): Promise<string[]> {
	const rows = await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name));
	return rows.map((row) => row.name);
}

export const GET: RequestHandler = async () => {
	return json({ tags: await listTags() });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentTagRequest;
	const tag = normalizeDocumentTag(body.tag);

	if (!DOCUMENT_TAG_PATTERN.test(tag)) {
		return json(
			{
				error:
					'Tags must start with a letter or number and use only letters, numbers, dashes, or underscores.'
			},
			{ status: 400 }
		);
	}

	await db
		.insert(tags)
		.values({ name: tag, createdAt: new Date().toISOString() })
		.onConflictDoNothing();

	return json({ tags: await listTags() }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentTagAssignmentRequest;
	const tag = normalizeDocumentTag(body.tag);
	const documentIds = [...new Set(body.documentIds)];

	if (!DOCUMENT_TAG_PATTERN.test(tag) || documentIds.length === 0) {
		return json({ error: 'A valid tag and at least one document are required.' }, { status: 400 });
	}

	if (body.assigned) {
		await db
			.insert(tags)
			.values({ name: tag, createdAt: new Date().toISOString() })
			.onConflictDoNothing();
		await db
			.insert(documentTags)
			.values(documentIds.map((documentId) => ({ documentId, tag })))
			.onConflictDoNothing();
	} else {
		await db
			.delete(documentTags)
			.where(and(inArray(documentTags.documentId, documentIds), eq(documentTags.tag, tag)));
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentTagRequest;
	const tag = normalizeDocumentTag(body.tag);

	if (!DOCUMENT_TAG_PATTERN.test(tag)) {
		return json({ error: 'A valid tag is required.' }, { status: 400 });
	}

	await db.delete(documentTags).where(eq(documentTags.tag, tag));
	await db.delete(tags).where(eq(tags.name, tag));

	return json({ tags: await listTags() });
};
