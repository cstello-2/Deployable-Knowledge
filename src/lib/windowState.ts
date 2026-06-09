import { derived, writable } from 'svelte/store';
import { windowDefinitions, type WindowColumn } from './windows';

export type WindowPlacement = {
	id: string;
	column: WindowColumn;
	visible: boolean;
	collapsed: boolean;
	height: number | null;
};

type WindowDropPlacement = {
	windowId: string | null;
	columnId: string | null;
	columnIndex: number;
};

const WINDOW_PLACEMENTS_STORAGE_KEY = 'layout:windowPlacements';
const DEFAULT_WINDOW_HEIGHT = 320;
const definitionsById = new Map(windowDefinitions.map((definition) => [definition.id, definition]));

function defaultWindowPlacements(): WindowPlacement[] {
	return windowDefinitions.map((definition) => ({
		id: definition.id,
		column: definition.column,
		visible: true,
		collapsed: false,
		height: DEFAULT_WINDOW_HEIGHT
	}));
}

export const windowPlacements = writable<WindowPlacement[]>(defaultWindowPlacements());

let storageInitialized = false;

export function initWindowStateStorage() {
	if (storageInitialized || typeof localStorage === 'undefined') return;

	storageInitialized = true;
	windowPlacements.set(readWindowPlacements());
	windowPlacements.subscribe(saveWindowPlacements);
}

export const visibleWindows = derived(windowPlacements, ($placements) =>
	$placements
		.filter((placement) => placement.visible)
		.map((placement) => {
			const definition = definitionsById.get(placement.id);
			return definition
				? {
						...definition,
						column: placement.column,
						collapsed: placement.collapsed,
						height: placement.height
					}
				: null;
		})
		.filter((definition) => definition !== null)
);

export function showWindow(id: string) {
	windowPlacements.update((placements) =>
		placements.map((placement) =>
			placement.id === id
				? {
						...placement,
						visible: true,
						collapsed: false,
						height: placement.height ?? DEFAULT_WINDOW_HEIGHT
					}
				: placement
		)
	);
}

export function closeWindow(id: string) {
	windowPlacements.update((placements) =>
		placements.map((placement) =>
			placement.id === id ? { ...placement, visible: false } : placement
		)
	);
}

export function toggleWindowCollapsed(id: string) {
	windowPlacements.update((placements) =>
		placements.map((placement) =>
			placement.id === id ? { ...placement, collapsed: !placement.collapsed } : placement
		)
	);
}

export function setWindowHeight(id: string, height: number) {
	const nextHeight = Math.max(0, Math.round(height));
	windowPlacements.update((placements) =>
		placements.map((placement) =>
			placement.id === id ? { ...placement, height: nextHeight } : placement
		)
	);
}

export function setWindowHeights(updates: { id: string; height: number }[]) {
	const heights = new Map(
		updates.map(({ id, height }) => [id, Math.max(0, Math.round(height))])
	);

	windowPlacements.update((placements) =>
		placements.map((placement) =>
			heights.has(placement.id)
				? { ...placement, height: heights.get(placement.id) ?? placement.height }
				: placement
		)
	);
}

export function placeWindowFromDrop({ windowId, columnId, columnIndex }: WindowDropPlacement) {
	if (!windowId || !isWindowColumn(columnId)) return;

	windowPlacements.update((placements) => {
		const moving = placements.find((placement) => placement.id === windowId);
		if (!moving) return placements;

		const nextMoving = {
			...moving,
			column: columnId,
			visible: true,
			height: moving.height ?? DEFAULT_WINDOW_HEIGHT
		};
		const remaining = placements.filter((placement) => placement.id !== windowId);
		const targetColumnWindows = remaining.filter(
			(placement) => placement.visible && placement.column === columnId
		);
		const before = targetColumnWindows[columnIndex];

		if (before) {
			const insertAt = remaining.findIndex((placement) => placement.id === before.id);
			return ensureVisibleWindowHeights([
				...remaining.slice(0, insertAt),
				nextMoving,
				...remaining.slice(insertAt)
			]);
		}

		const lastTarget = targetColumnWindows.at(-1);
		if (lastTarget) {
			const insertAt = remaining.findIndex((placement) => placement.id === lastTarget.id) + 1;
			return ensureVisibleWindowHeights([
				...remaining.slice(0, insertAt),
				nextMoving,
				...remaining.slice(insertAt)
			]);
		}

		return ensureVisibleWindowHeights([...remaining, nextMoving]);
	});
}

function readWindowPlacements() {
	const fallback = defaultWindowPlacements();

	try {
		const stored = localStorage.getItem(WINDOW_PLACEMENTS_STORAGE_KEY);
		if (!stored) return fallback;

		return mergeWindowPlacements(JSON.parse(stored));
	} catch {
		return fallback;
	}
}

function saveWindowPlacements(placements: WindowPlacement[]) {
	try {
		localStorage.setItem(WINDOW_PLACEMENTS_STORAGE_KEY, JSON.stringify(placements));
	} catch {
		// Ignore storage failures; the in-memory store remains authoritative for this session.
	}
}

function mergeWindowPlacements(value: unknown) {
	const fallback = defaultWindowPlacements();
	if (!Array.isArray(value)) return fallback;

	const fallbackById = new Map(fallback.map((placement) => [placement.id, placement]));
	const seen = new Set<string>();
	const next: WindowPlacement[] = [];

	for (const item of value) {
		if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;

		const defaultPlacement = fallbackById.get(item.id);
		if (!defaultPlacement) continue;

		next.push({
			id: defaultPlacement.id,
			column: isWindowColumn(item.column) ? item.column : defaultPlacement.column,
			visible: typeof item.visible === 'boolean' ? item.visible : defaultPlacement.visible,
			collapsed: typeof item.collapsed === 'boolean' ? item.collapsed : defaultPlacement.collapsed,
			height: parseWindowHeight(item.height) ?? defaultPlacement.height
		});
		seen.add(item.id);
	}

	return [...next, ...fallback.filter((placement) => !seen.has(placement.id))];
}

function parseWindowHeight(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function ensureVisibleWindowHeights(placements: WindowPlacement[]) {
	return placements.map((placement) =>
		placement.visible && placement.height === null
			? { ...placement, height: DEFAULT_WINDOW_HEIGHT }
			: placement
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isWindowColumn(value: unknown): value is WindowColumn {
	return value === 'left' || value === 'right';
}
