import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { toolRegistry } from '$lib/server/tools';
import { db } from '$lib/server/database/database';
import { clearActiveProfileId } from '$lib/server/database/app-state';
import { profiles, type AssistantProfileUpdateValues } from '$lib/server/database/schema';
import { sanitizeGpuMode } from '$lib/server/utils/profile-values';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as AssistantProfileUpdateValues;
	const existing = await db.select().from(profiles).where(eq(profiles.id, params.id)).get();

	if (!existing) {
		throw error(404, 'Profile not found');
	}

	const name = body.name ? body.name.trim() : existing.name;

	if (!name) {
		throw error(400, 'Profile name is required');
	}

	const [row] = await db
		.update(profiles)
		.set({
			name,
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
		.where(eq(profiles.id, params.id))
		.returning();

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	await clearActiveProfileId(params.id);

	const [row] = await db.delete(profiles).where(eq(profiles.id, params.id)).returning();

	if (!row) {
		throw error(404, 'Profile not found');
	}

	return json(row);
};
