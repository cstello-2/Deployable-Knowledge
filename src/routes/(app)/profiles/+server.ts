import { randomUUID } from 'node:crypto';

import { error, json } from '@sveltejs/kit';

import { db } from '$lib/server/database/database';
import { seedLocalUser } from '$lib/server/database/seed';
import { profiles, type AssistantProfileCreateValues } from '$lib/server/database/schema';
import { ProfilesRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const user = await seedLocalUser();
	const response = {
		profiles: await ProfilesRepository.list(user.id),
		activeProfileId: user.activeProfileId
	};

	return json(response);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as AssistantProfileCreateValues;
	const name = body.name.trim();

	if (!name) {
		throw error(400, 'Profile name is required');
	}

	const user = await seedLocalUser();
	const timestamp = new Date();
	const [row] = await db
		.insert(profiles)
		.values({
			id: randomUUID(),
			userId: user.id,
			name,
			provider: body.provider,
			model: body.model,
			maxTokens: body.maxTokens,
			temperature: body.temperature,
			topK: body.topK,
			retrievalMode: body.retrievalMode,
			ragTopK: body.ragTopK,
			agentMaxTurns: body.agentMaxTurns,
			promptTemplateId: body.promptTemplateId,
			persona: body.persona,
			createdAt: timestamp,
			updatedAt: timestamp
		})
		.returning();

	return json(row, { status: 201 });
};
