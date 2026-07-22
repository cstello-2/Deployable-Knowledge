import { randomUUID } from 'node:crypto';

import { error, json } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';

import type { ApiPromptTemplateRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { promptTemplates } from '$lib/server/database/schema';
import { seedLocalUser } from '$lib/server/database/seed';
import type { RequestHandler } from './$types';

async function getLocalUserId() {
	const user = await seedLocalUser();
	return user.id;
}

export const GET: RequestHandler = async () => {
	const userId = await getLocalUserId();
	const rows = await db
		.select()
		.from(promptTemplates)
		.where(eq(promptTemplates.userId, userId))
		.orderBy(asc(promptTemplates.name));

	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiPromptTemplateRequest;
	const name = body.name.trim();

	if (!name) {
		throw error(400, 'Prompt template name is required');
	}

	const timestamp = new Date();
	const [row] = await db
		.insert(promptTemplates)
		.values({
			id: randomUUID(),
			userId: await getLocalUserId(),
			name,
			description: body.description,
			systemPrompt: body.systemPrompt,
			createdAt: timestamp,
			updatedAt: timestamp
		})
		.returning();

	return json(row, { status: 201 });
};
