import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import type { ApiPromptTemplateRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { profiles, promptTemplates } from '$lib/server/database/schema';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiPromptTemplateRequest;
	const name = body.name.trim();

	if (!name) {
		throw error(400, 'Prompt template name is required');
	}

	const [row] = await db
		.update(promptTemplates)
		.set({
			name,
			description: body.description,
			systemPrompt: body.systemPrompt,
			updatedAt: new Date()
		})
		.where(eq(promptTemplates.id, params.id))
		.returning();

	if (!row) {
		throw error(404, 'Prompt template not found');
	}

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	await db
		.update(profiles)
		.set({ promptTemplateId: null, updatedAt: new Date() })
		.where(eq(profiles.promptTemplateId, params.id));

	const [row] = await db
		.delete(promptTemplates)
		.where(eq(promptTemplates.id, params.id))
		.returning();

	if (!row) {
		throw error(404, 'Prompt template not found');
	}

	return json(row);
};
