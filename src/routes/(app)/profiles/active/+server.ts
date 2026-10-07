import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { toolRegistry } from '$lib/server/tools';
import { db } from '$lib/server/database/database';
import { profiles, type AssistantProfileValues } from '$lib/server/database/schema';
import { ensureActiveProfileId, getActiveProfile } from '$lib/server/profiles/active-profile';
import { sanitizeGpuMode } from '$lib/server/utils/profile-values';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const profile = await getActiveProfile();

	return json(profile);
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as AssistantProfileValues;
	const activeProfileId = await ensureActiveProfileId();

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
			gpuMode: sanitizeGpuMode(body.gpuMode),
			enabledTools: toolRegistry.filterIds(body.enabledTools),
			promptTemplateId: body.promptTemplateId,
			persona: body.persona,
			updatedAt: new Date()
		})
		.where(eq(profiles.id, activeProfileId))
		.returning();

	if (!row) {
		throw error(404, 'No active profile');
	}

	return json(row);
};
