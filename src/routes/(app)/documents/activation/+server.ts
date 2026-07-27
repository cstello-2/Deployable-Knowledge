import { json, type RequestHandler } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import type { ApiDocumentActivationRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documents } from '$lib/server/database/schema';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentActivationRequest;

	if (typeof body.active !== 'boolean') {
		return json({ error: 'active must be a boolean.' }, { status: 400 });
	}

	const documentIds = body.documentIds === undefined ? null : [...new Set(body.documentIds)];
	if (documentIds && documentIds.length === 0) {
		return json(
			{ error: 'Provide at least one document, or omit documentIds to update every document.' },
			{ status: 400 }
		);
	}

	const update = db.update(documents).set({ active: body.active });
	if (documentIds) await update.where(inArray(documents.id, documentIds));
	else await update;

	return json({ ok: true });
};
