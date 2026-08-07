import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { toolRegistry } from '$lib/server/tools';
import { db } from '$lib/server/database/database';
import { seedLocalUser } from '$lib/server/database/seed';
import { profiles, type AssistantProfileValues } from '$lib/server/database/schema';
import { sanitizeContextSize, sanitizeGpuMode } from '$lib/server/utils/profile-values';
import { ProfilesRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const user = await seedLocalUser();
	const profile = await ProfilesRepository.getActive(user);

	return json(profile);
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as AssistantProfileValues;
	const user = await seedLocalUser();

	if (!user.activeProfileId) {
		throw error(404, 'No active profile');
	}

	const [row] = await db
		.update(profiles)
		.set({
			provider: body.provider,
			model: body.model,
			maxTokens: body.maxTokens,
			temperature: body.temperature,
			topK: body.topK,
			reasoningBudget: body.reasoningBudget,
			retrievalMode: body.retrievalMode,
			ragTopK: body.ragTopK,
			agentMaxTurns: body.agentMaxTurns,
			contextSize: sanitizeContextSize(body.contextSize),
			gpuMode: sanitizeGpuMode(body.gpuMode),
			enabledTools: toolRegistry.filterIds(body.enabledTools),
			promptTemplateId: body.promptTemplateId,
			persona: body.persona,
			updatedAt: new Date()
		})
		.where(and(eq(profiles.id, user.activeProfileId), eq(profiles.userId, user.id)))
		.returning();

	if (!row) {
		throw error(404, 'No active profile');
	}

	return json(row);
};
