import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import {
	DEFAULT_WINDOW_HEIGHT,
	DEFAULT_WINDOW_PLACEMENTS,
	LAYOUT_NAME_MAX_LENGTH
} from '$lib/constants';
import { WindowColumn } from '$lib/enums';
import { WorkspaceLayoutsService } from '$lib/services';
import type {
	WindowDropPlacement,
	WindowPlacement,
	WorkspaceLayout,
	WorkspaceLayoutSnapshot,
	WorkspaceLayoutStateResponse
} from '$lib/types';
import { createAutosave } from '$lib/utils';

const SNAPSHOT_SAVE_DELAY = 400;

class WorkspaceStore {
	private loading = false;
	private suppressLayoutSave = false;
	private autosave = createAutosave(() => this.saveActiveSnapshot(), SNAPSHOT_SAVE_DELAY);
	windowPlacements = $state<WindowPlacement[]>(clonePlacements(DEFAULT_WINDOW_PLACEMENTS));
	leftPaneCollapsed = $state(false);
	leftPaneWidth = $state<number | null>(null);
	windowMovementLocked = $state(false);
	layouts = $state<WorkspaceLayout[]>([]);
	activeLayoutId = $state<string | null>(null);
	ready = $state(false);

	get visiblePlacements(): WindowPlacement[] {
		return this.windowPlacements.filter(({ visible }) => visible);
	}

	async init(): Promise<void> {
		if (!browser || this.ready || this.loading) return;
		this.loading = true;
		try {
			this.applyState(await WorkspaceLayoutsService.list());
			window.addEventListener('pagehide', this.handlePageHide);
			this.ready = true;
		} catch (error) {
			toast.error(message(error));
		} finally {
			this.loading = false;
		}
	}

	isWindowVisible(id: string): boolean {
		return this.windowPlacements.find((item) => item.id === id)?.visible ?? false;
	}

	showWindow(id: string): void {
		this.leftPaneCollapsed = false;
		this.mutatePlacements((items) => {
			const existing = items.find((item) => item.id === id);
			if (!existing) {
				const fallback = DEFAULT_WINDOW_PLACEMENTS.find((item) => item.id === id);
				if (!fallback) return items;

				return [
					...items,
					{
						...fallback,
						visible: true,
						collapsed: false,
						height: fallback.height ?? DEFAULT_WINDOW_HEIGHT
					}
				];
			}

			return items.map((item) =>
				item.id === id
					? {
							...item,
							visible: true,
							collapsed: false,
							height: item.height ?? DEFAULT_WINDOW_HEIGHT
						}
					: item
			);
		});
	}

	closeWindow(id: string): void {
		this.mutatePlacements((items) =>
			items.map((item) => (item.id === id ? { ...item, visible: false } : item))
		);
	}

	toggleWindowCollapsed(id: string): void {
		this.mutatePlacements((items) =>
			items.map((item) => (item.id === id ? { ...item, collapsed: !item.collapsed } : item))
		);
	}

	setWindowHeights(updates: { id: string; height: number }[]): void {
		const heights = new Map(updates.map(({ id, height }) => [id, Math.max(0, Math.round(height))]));
		this.mutatePlacements((items) =>
			items.map((item) =>
				heights.has(item.id) ? { ...item, height: heights.get(item.id) ?? item.height } : item
			)
		);
	}

	placeWindowFromDrop({ windowId, columnId, columnIndex }: WindowDropPlacement): void {
		if (!windowId || !isWindowColumn(columnId)) return;

		this.mutatePlacements((items) => {
			const moving = items.find(({ id }) => id === windowId);
			if (!moving) return items;

			const moved: WindowPlacement = {
				...moving,
				column: columnId,
				visible: true,
				height: moving.height ?? DEFAULT_WINDOW_HEIGHT
			};
			const remaining = items.filter(({ id }) => id !== windowId);
			const targets = remaining.filter((item) => item.visible && item.column === columnId);
			const before = targets[columnIndex];
			if (before) {
				const at = remaining.findIndex(({ id }) => id === before.id);
				return ensureHeights([...remaining.slice(0, at), moved, ...remaining.slice(at)]);
			}

			const last = targets.at(-1);
			if (last) {
				const at = remaining.findIndex(({ id }) => id === last.id) + 1;
				return ensureHeights([...remaining.slice(0, at), moved, ...remaining.slice(at)]);
			}

			return ensureHeights([...remaining, moved]);
		});
	}

	toggleLeftPaneCollapsed(): void {
		if (!this.ready) return;
		this.leftPaneCollapsed = !this.leftPaneCollapsed;
		this.changed();
	}

	setLeftPaneWidth(width: number | null): void {
		const nextWidth = width && Number.isFinite(width) && width > 0 ? Math.round(width) : null;
		if (nextWidth === this.leftPaneWidth) return;

		this.leftPaneWidth = nextWidth;
		this.changed();
	}

	renameLayout(id: string, name: string): void {
		if (!this.ready) return;
		const nextName = name.trim().slice(0, LAYOUT_NAME_MAX_LENGTH);
		if (!nextName) return;
		this.layouts = this.layouts.map((layout) =>
			layout.id === id ? { ...layout, name: nextName } : layout
		);
		void this.request(() => WorkspaceLayoutsService.update(id, { name: nextName }));
	}

	setWindowMovementLocked(id: string, locked: boolean): void {
		if (!this.ready) return;
		const layout = this.layouts.find((candidate) => candidate.id === id);
		if (!layout) return;

		const snapshot = { ...layout.snapshot, windowMovementLocked: locked };
		if (id === this.activeLayoutId) this.windowMovementLocked = locked;
		this.layouts = this.layouts.map((candidate) =>
			candidate.id === id ? { ...candidate, snapshot } : candidate
		);
		void this.request(() => WorkspaceLayoutsService.update(id, { snapshot }));
	}

	async applyLayout(id: string): Promise<void> {
		if (!this.ready || id === this.activeLayoutId) return;
		const layout = this.layouts.find((candidate) => candidate.id === id);
		if (!layout) return;

		// Flush first so a debounced snapshot lands on the layout it belongs to.
		await this.autosave.flush();
		this.restore(id, layout.snapshot);
		await this.request(() => WorkspaceLayoutsService.activate(id));
	}

	async addLayout(): Promise<void> {
		if (!this.ready) return;
		await this.autosave.flush();
		const snapshot = this.capture();
		await this.request(async () => {
			const layout = await WorkspaceLayoutsService.create({ snapshot });
			this.layouts = [...this.layouts, layout];
			this.restore(layout.id, layout.snapshot);
			await WorkspaceLayoutsService.activate(layout.id);
		});
	}

	async moveLayout(movingId: string, targetIndex: number): Promise<void> {
		if (!this.ready) return;
		const currentIndex = this.layouts.findIndex(({ id }) => id === movingId);
		if (currentIndex < 0) return;
		const insertIndex = Math.max(0, Math.min(targetIndex, this.layouts.length - 1));
		if (insertIndex === currentIndex) return;

		// The reorder response rewrites every layout, so a debounced snapshot has to
		// reach the server first or it would be overwritten by the stored copy.
		await this.autosave.flush();
		const layouts = [...this.layouts];
		const [moving] = layouts.splice(currentIndex, 1);
		layouts.splice(insertIndex, 0, moving);
		this.layouts = layouts;
		await this.request(async () =>
			this.applyState(await WorkspaceLayoutsService.reorder(layouts.map(({ id }) => id)))
		);
	}

	async deleteLayout(id: string): Promise<void> {
		if (!this.ready || this.layouts.length <= 1) return;
		if (!this.layouts.some((layout) => layout.id === id)) return;

		await this.autosave.flush();
		await this.request(async () => this.applyState(await WorkspaceLayoutsService.delete(id)));
	}

	private applyState({ layouts, activeLayoutId }: WorkspaceLayoutStateResponse): void {
		this.layouts = layouts;
		const active = layouts.find(({ id }) => id === activeLayoutId) ?? layouts[0];
		if (active) this.restore(active.id, active.snapshot);
	}

	private mutatePlacements(mutate: (items: WindowPlacement[]) => WindowPlacement[]): void {
		this.windowPlacements = mutate(this.windowPlacements);
		this.changed();
	}

	private changed(): void {
		if (!this.ready || this.suppressLayoutSave || !this.activeLayoutId) return;
		const snapshot = this.capture();
		this.layouts = this.layouts.map((layout) =>
			layout.id === this.activeLayoutId ? { ...layout, snapshot: cloneSnapshot(snapshot) } : layout
		);
		this.autosave.schedule();
	}

	private capture(): WorkspaceLayoutSnapshot {
		return {
			windowPlacements: clonePlacements(this.windowPlacements),
			leftWidth: this.leftPaneWidth,
			leftPaneCollapsed: this.leftPaneCollapsed,
			windowMovementLocked: this.windowMovementLocked
		};
	}

	private restore(id: string, snapshot: WorkspaceLayoutSnapshot): void {
		const wasSuppressed = this.suppressLayoutSave;
		this.suppressLayoutSave = true;
		this.activeLayoutId = id;
		this.leftPaneWidth = snapshot.leftWidth;
		this.leftPaneCollapsed = snapshot.leftPaneCollapsed;
		this.windowMovementLocked = snapshot.windowMovementLocked;
		this.windowPlacements = clonePlacements(snapshot.windowPlacements);
		this.suppressLayoutSave = wasSuppressed;
	}

	private saveActiveSnapshot(options?: { keepalive: boolean }): Promise<void> {
		const id = this.activeLayoutId;
		if (!id) return Promise.resolve();
		return this.request(() =>
			WorkspaceLayoutsService.update(id, { snapshot: this.capture() }, options)
		);
	}

	private async request(run: () => Promise<unknown>): Promise<void> {
		try {
			await run();
		} catch (error) {
			toast.error(message(error));
		}
	}

	private handlePageHide = (): void => {
		if (!this.autosave.pending()) return;
		void this.saveActiveSnapshot({ keepalive: true });
	};
}

function ensureHeights(items: WindowPlacement[]): WindowPlacement[] {
	return items.map((item) =>
		item.visible && item.height === null ? { ...item, height: DEFAULT_WINDOW_HEIGHT } : item
	);
}

function cloneSnapshot(snapshot: WorkspaceLayoutSnapshot): WorkspaceLayoutSnapshot {
	return {
		windowPlacements: clonePlacements(snapshot.windowPlacements),
		leftWidth: snapshot.leftWidth,
		leftPaneCollapsed: snapshot.leftPaneCollapsed,
		windowMovementLocked: snapshot.windowMovementLocked
	};
}

function clonePlacements(items: WindowPlacement[]): WindowPlacement[] {
	return items.map((item) => ({ ...item }));
}

function isWindowColumn(value: unknown): value is WindowColumn {
	return value === WindowColumn.LEFT || value === WindowColumn.RIGHT;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const workspaceStore = new WorkspaceStore();
