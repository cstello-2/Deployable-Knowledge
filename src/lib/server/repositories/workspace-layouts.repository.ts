import { randomUUID } from 'node:crypto';
import { asc, eq, max } from 'drizzle-orm';

import { DEFAULT_LAYOUT_NAME } from '$lib/constants';
import type { WorkspaceLayoutStateResponse } from '$lib/types';
import { db } from '$lib/server/database/database';
import { getActiveLayoutId, setActiveLayoutId } from '$lib/server/database/app-state';
import {
	workspaceLayouts,
	type WorkspaceLayout,
	type NewWorkspaceLayout
} from '$lib/server/database/schema';
import { defaultLayoutSnapshot } from '$lib/server/workspace/layout-values';
import { hasExactIds } from '$lib/server/utils/reorder';

export class WorkspaceLayoutsRepository {
	static list() {
		return db
			.select()
			.from(workspaceLayouts)
			.orderBy(asc(workspaceLayouts.sortOrder), asc(workspaceLayouts.createdAt));
	}

	static find(id: string) {
		return db.select().from(workspaceLayouts).where(eq(workspaceLayouts.id, id)).get();
	}

	static async create(values: Pick<NewWorkspaceLayout, 'name' | 'snapshot'>) {
		const [result] = await db
			.select({ maximum: max(workspaceLayouts.sortOrder) })
			.from(workspaceLayouts);
		const timestamp = new Date();
		const [row] = await db
			.insert(workspaceLayouts)
			.values({
				id: randomUUID(),
				name: values.name,
				snapshot: values.snapshot,
				sortOrder: (result?.maximum ?? -1) + 1,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.returning();
		return row;
	}

	static async reorder(orderedIds: readonly string[]): Promise<boolean> {
		const current = await db.select({ id: workspaceLayouts.id }).from(workspaceLayouts);
		if (!hasExactIds(current, orderedIds)) return false;

		await db.transaction(async (transaction) => {
			for (const [sortOrder, id] of orderedIds.entries()) {
				await transaction
					.update(workspaceLayouts)
					.set({ sortOrder })
					.where(eq(workspaceLayouts.id, id));
			}
		});
		return true;
	}

	// Seeds the first layout on a fresh database and repairs a missing or dangling
	// active pointer, so callers always get a usable layout to render.
	static async loadState(): Promise<WorkspaceLayoutStateResponse> {
		let layouts: WorkspaceLayout[] = await this.list();
		if (!layouts.length) {
			layouts = [
				await this.create({ name: DEFAULT_LAYOUT_NAME, snapshot: defaultLayoutSnapshot() })
			];
		}

		const activeLayoutId = await getActiveLayoutId();
		if (activeLayoutId && layouts.some(({ id }) => id === activeLayoutId)) {
			return { layouts, activeLayoutId };
		}

		await setActiveLayoutId(layouts[0].id);
		return { layouts, activeLayoutId: layouts[0].id };
	}
}
