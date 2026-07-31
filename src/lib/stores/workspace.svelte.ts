import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import { STORAGE_KEYS } from '$lib/constants';
import { WindowColumn } from '$lib/enums';
import type {
	LayoutPreset,
	WindowDropPlacement,
	WindowPlacement,
	WorkspaceLayoutSnapshot
} from '$lib/types';

const DEFAULT_PRESET_ID = 'layout-default';
const DEFAULT_WINDOW_HEIGHT = 320;

const DEFAULT_PLACEMENTS: WindowPlacement[] = [
	placement('documents-window', WindowColumn.LEFT),
	placement('chat-history-window', WindowColumn.LEFT),
	placement('graph-galaxy-window', WindowColumn.LEFT),
	placement('chat-window', WindowColumn.RIGHT),
	placement('search-context-window', WindowColumn.RIGHT),
	placement('notebook-window', WindowColumn.RIGHT)
];

interface StoredPresetState {
	activePresetId: string;
	presets: LayoutPreset[];
}

class WorkspaceStore {
	private initialized = false;
	private suppressPresetSave = false;
	windowPlacements = $state<WindowPlacement[]>(clonePlacements(DEFAULT_PLACEMENTS));
	leftPaneCollapsed = $state(false);
	leftPaneWidth = $state<number | null>(null);
	windowMovementLocked = $state(false);
	layoutPresets = $state<LayoutPreset[]>([]);
	activeLayoutPresetId = $state(DEFAULT_PRESET_ID);

	get visiblePlacements(): WindowPlacement[] {
		return this.windowPlacements.filter(({ visible }) => visible);
	}

	init(): void {
		if (!browser || this.initialized) return;

		this.windowPlacements = readPlacements();
		const stored = readPresetState();
		const presets = stored?.presets.length
			? stored.presets
			: [createPreset(DEFAULT_PRESET_ID, 'Layout 1', this.capture())];
		const active = presets.find(({ id }) => id === stored?.activePresetId) ?? presets[0];

		this.layoutPresets = presets;
		this.restore(active.id, active.snapshot);
		this.initialized = true;
		this.persist();
	}

	isWindowVisible(id: string): boolean {
		return this.windowPlacements.find((item) => item.id === id)?.visible ?? false;
	}

	showWindow(id: string): void {
		this.leftPaneCollapsed = false;
		this.mutatePlacements((items) =>
			items.map((item) =>
				item.id === id
					? {
							...item,
							visible: true,
							collapsed: false,
							height: item.height ?? DEFAULT_WINDOW_HEIGHT
						}
					: item
			)
		);
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
		this.ensureInitialized();
		this.leftPaneCollapsed = !this.leftPaneCollapsed;
		this.changed();
	}

	setLeftPaneWidth(width: number | null): void {
		const nextWidth = width && Number.isFinite(width) && width > 0 ? Math.round(width) : null;
		if (nextWidth === this.leftPaneWidth) return;

		this.leftPaneWidth = nextWidth;
		this.changed();
	}

	renameLayoutPreset(id: string, name: string): void {
		this.ensureInitialized();
		const nextName = name.trim().slice(0, 64);
		if (!nextName) return;
		this.layoutPresets = this.layoutPresets.map((preset) =>
			preset.id === id ? { ...preset, name: nextName } : preset
		);
		this.persist();
	}

	setWindowMovementLocked(id: string, locked: boolean): void {
		this.ensureInitialized();
		if (!this.layoutPresets.some((preset) => preset.id === id)) return;
		if (id === this.activeLayoutPresetId) this.windowMovementLocked = locked;
		this.layoutPresets = this.layoutPresets.map((preset) =>
			preset.id === id
				? {
						...preset,
						snapshot: { ...preset.snapshot, windowMovementLocked: locked }
					}
				: preset
		);
		this.persist();
	}

	applyLayoutPreset(id: string): void {
		this.ensureInitialized();
		const preset = this.layoutPresets.find((candidate) => candidate.id === id);
		if (preset) this.restore(id, preset.snapshot);
	}

	addLayoutPreset(): void {
		this.ensureInitialized();
		let number = this.layoutPresets.length + 1;
		while (this.layoutPresets.some(({ name }) => name === `Layout ${number}`)) number += 1;
		const preset = createPreset(createPresetId(), `Layout ${number}`, this.capture());
		this.layoutPresets = [...this.layoutPresets, preset];
		this.activeLayoutPresetId = preset.id;
		this.persist();
	}

	moveLayoutPreset(movingId: string, targetIndex: number): void {
		this.ensureInitialized();
		const currentIndex = this.layoutPresets.findIndex(({ id }) => id === movingId);
		if (currentIndex < 0) return;
		const insertIndex = Math.max(0, Math.min(targetIndex, this.layoutPresets.length - 1));
		if (insertIndex === currentIndex) return;

		const presets = [...this.layoutPresets];
		const [moving] = presets.splice(currentIndex, 1);
		presets.splice(insertIndex, 0, moving);
		this.layoutPresets = presets;
		this.persist();
	}

	deleteLayoutPreset(id: string): void {
		this.ensureInitialized();
		if (this.layoutPresets.length <= 1) return;

		const deletedIndex = this.layoutPresets.findIndex((preset) => preset.id === id);
		if (deletedIndex < 0) return;

		const nextPresets = this.layoutPresets.filter((preset) => preset.id !== id);
		if (id !== this.activeLayoutPresetId) {
			this.layoutPresets = nextPresets;
			this.persist();
			return;
		}

		const next = nextPresets[Math.min(deletedIndex, nextPresets.length - 1)] ?? nextPresets[0];
		if (!next) return;

		this.suppressPresetSave = true;
		this.layoutPresets = nextPresets;
		this.restore(next.id, next.snapshot);
		this.suppressPresetSave = false;
		this.persist();
	}

	private mutatePlacements(mutate: (items: WindowPlacement[]) => WindowPlacement[]): void {
		this.windowPlacements = mutate(this.windowPlacements);
		this.changed();
	}

	private changed(): void {
		if (!this.initialized || this.suppressPresetSave) return;
		const snapshot = this.capture();
		this.layoutPresets = this.layoutPresets.map((preset) =>
			preset.id === this.activeLayoutPresetId
				? { ...preset, snapshot: cloneSnapshot(snapshot) }
				: preset
		);
		this.persist();
	}

	private capture(): WorkspaceLayoutSnapshot {
		return {
			windowPlacements: clonePlacements(normalizePlacements(this.windowPlacements)),
			leftWidth: this.leftPaneWidth,
			leftPaneCollapsed: this.leftPaneCollapsed,
			windowMovementLocked: this.windowMovementLocked
		};
	}

	private restore(id: string, snapshot: WorkspaceLayoutSnapshot): void {
		const wasSuppressed = this.suppressPresetSave;
		this.suppressPresetSave = true;
		this.activeLayoutPresetId = id;
		this.leftPaneWidth = snapshot.leftWidth;
		this.leftPaneCollapsed = snapshot.leftPaneCollapsed;
		this.windowMovementLocked = snapshot.windowMovementLocked;
		this.windowPlacements = normalizePlacements(snapshot.windowPlacements);
		this.suppressPresetSave = wasSuppressed;
		this.persist();
	}

	private persist(): void {
		if (!browser || !this.initialized) return;
		localStorage.setItem(STORAGE_KEYS.WINDOW_PLACEMENTS, JSON.stringify(this.windowPlacements));
		localStorage.setItem(
			STORAGE_KEYS.LAYOUT_PRESET_STATE,
			JSON.stringify({
				activePresetId: this.activeLayoutPresetId,
				presets: this.layoutPresets
			} satisfies StoredPresetState)
		);
	}

	private ensureInitialized(): void {
		if (!this.initialized) this.init();
	}
}

function placement(id: string, column: WindowColumn): WindowPlacement {
	return { id, column, visible: true, collapsed: false, height: DEFAULT_WINDOW_HEIGHT };
}

function readPlacements(): WindowPlacement[] {
	try {
		return normalizePlacements(
			JSON.parse(localStorage.getItem(STORAGE_KEYS.WINDOW_PLACEMENTS) ?? 'null')
		);
	} catch {
		return clonePlacements(DEFAULT_PLACEMENTS);
	}
}

function readPresetState(): StoredPresetState | null {
	const current = parsePresetState(localStorage.getItem(STORAGE_KEYS.LAYOUT_PRESET_STATE));
	if (current) return current;

	const presets = parsePresets(localStorage.getItem(STORAGE_KEYS.LEGACY_LAYOUT_PRESETS));
	if (!presets.length) return null;
	return {
		activePresetId: localStorage.getItem(STORAGE_KEYS.LEGACY_ACTIVE_LAYOUT_PRESET) ?? presets[0].id,
		presets
	};
}

function parsePresetState(value: string | null): StoredPresetState | null {
	try {
		const parsed: unknown = JSON.parse(value ?? 'null');
		if (!isRecord(parsed) || typeof parsed.activePresetId !== 'string') return null;
		const presets = normalizePresets(parsed.presets);
		return presets.length ? { activePresetId: parsed.activePresetId, presets } : null;
	} catch {
		return null;
	}
}

function parsePresets(value: string | null): LayoutPreset[] {
	try {
		return normalizePresets(JSON.parse(value ?? '[]'));
	} catch {
		return [];
	}
}

function normalizePresets(value: unknown): LayoutPreset[] {
	if (!Array.isArray(value)) return [];
	const seen = new SvelteSet<string>();
	const result: LayoutPreset[] = [];
	for (const item of value) {
		if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
		const snapshot = normalizeSnapshot(item.snapshot);
		if (!snapshot) continue;
		seen.add(item.id);
		const name =
			typeof item.name === 'string' && item.name.trim()
				? item.name.trim()
				: `Layout ${result.length + 1}`;
		result.push({ id: item.id, name, snapshot });
	}
	return result;
}

function normalizeSnapshot(value: unknown): WorkspaceLayoutSnapshot | null {
	if (!isRecord(value)) return null;
	const leftWidth =
		typeof value.leftWidth === 'number' && Number.isFinite(value.leftWidth) && value.leftWidth > 0
			? Math.round(value.leftWidth)
			: null;
	return {
		windowPlacements: normalizePlacements(value.windowPlacements),
		leftWidth,
		leftPaneCollapsed:
			typeof value.leftPaneCollapsed === 'boolean' ? value.leftPaneCollapsed : false,
		windowMovementLocked:
			typeof value.windowMovementLocked === 'boolean' ? value.windowMovementLocked : false
	};
}

function normalizePlacements(value: unknown): WindowPlacement[] {
	if (!Array.isArray(value)) return clonePlacements(DEFAULT_PLACEMENTS);
	const defaultsById = new Map(DEFAULT_PLACEMENTS.map((item) => [item.id, item]));
	const seen = new SvelteSet<string>();
	const result: WindowPlacement[] = [];
	for (const item of value) {
		if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
		const fallback = defaultsById.get(item.id);
		if (!fallback) continue;
		result.push({
			id: fallback.id,
			column: isWindowColumn(item.column) ? item.column : fallback.column,
			visible: typeof item.visible === 'boolean' ? item.visible : fallback.visible,
			collapsed: typeof item.collapsed === 'boolean' ? item.collapsed : fallback.collapsed,
			height: windowHeight(item.height) ?? fallback.height
		});
		seen.add(item.id);
	}
	return [...result, ...DEFAULT_PLACEMENTS.filter(({ id }) => !seen.has(id))];
}

function windowHeight(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.round(value))
		: null;
}

function ensureHeights(items: WindowPlacement[]): WindowPlacement[] {
	return items.map((item) =>
		item.visible && item.height === null ? { ...item, height: DEFAULT_WINDOW_HEIGHT } : item
	);
}

function createPreset(id: string, name: string, snapshot: WorkspaceLayoutSnapshot): LayoutPreset {
	return { id, name, snapshot: cloneSnapshot(snapshot) };
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

function createPresetId(): string {
	return globalThis.crypto?.randomUUID
		? `layout-${globalThis.crypto.randomUUID()}`
		: `layout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isWindowColumn(value: unknown): value is WindowColumn {
	return value === WindowColumn.LEFT || value === WindowColumn.RIGHT;
}

export const workspaceStore = new WorkspaceStore();
