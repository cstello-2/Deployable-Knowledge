import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import type { ApiWorkspaceLayoutUpdateRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	clearActiveLayoutId,
	getActiveLayoutId,
	setActiveLayoutId
} from '$lib/server/database/app-state';
import { workspaceLayouts } from '$lib/server/database/schema';
import { WorkspaceLayoutsRepository } from '$lib/server/repositories';
import { normalizeLayoutName, normalizeLayoutSnapshot } from '$lib/server/workspace/layout-values';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiWorkspaceLayoutUpdateRequest;
	const existing = await WorkspaceLayoutsRepository.find(params.id);

	if (!existing) {
		throw error(404, 'Layout not found');
	}

	const name = body.name === undefined ? existing.name : normalizeLayoutName(body.name);
	if (!name) {
		throw error(400, 'Layout name is required');
	}

	const snapshot =
		body.snapshot === undefined ? existing.snapshot : normalizeLayoutSnapshot(body.snapshot);
	if (!snapshot) {
		throw error(400, 'Layout snapshot is invalid');
	}

	const [row] = await db
		.update(workspaceLayouts)
		.set({ name, snapshot, updatedAt: new Date() })
		.where(eq(workspaceLayouts.id, params.id))
		.returning();

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const layouts = await WorkspaceLayoutsRepository.list();
	const deletedIndex = layouts.findIndex(({ id }) => id === params.id);

	if (deletedIndex < 0) {
		throw error(404, 'Layout not found');
	}
	if (layouts.length <= 1) {
		throw error(400, 'The last layout cannot be deleted');
	}

	const wasActive = (await getActiveLayoutId()) === params.id;
	await clearActiveLayoutId(params.id);
	await db.delete(workspaceLayouts).where(eq(workspaceLayouts.id, params.id));

	// Selecting the neighbour rather than the first layout keeps the tab strip
	// behaving like a browser: closing the active tab activates the one that
	// slides into its place.
	if (wasActive) {
		const remaining = layouts.filter(({ id }) => id !== params.id);
		await setActiveLayoutId(remaining[Math.min(deletedIndex, remaining.length - 1)].id);
	}

	return json(await WorkspaceLayoutsRepository.loadState());
};
