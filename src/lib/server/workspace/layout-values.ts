import {
	DEFAULT_WINDOW_HEIGHT,
	DEFAULT_WINDOW_PLACEMENTS,
	LAYOUT_NAME_MAX_LENGTH
} from '$lib/constants';
import { WindowColumn } from '$lib/enums';
import type { WindowPlacement, WorkspaceLayoutSnapshot } from '$lib/types/workspace';

export function defaultLayoutSnapshot(): WorkspaceLayoutSnapshot {
	return {
		windowPlacements: clonePlacements(DEFAULT_WINDOW_PLACEMENTS),
		leftWidth: null,
		leftPaneCollapsed: false,
		windowMovementLocked: false
	};
}

export function normalizeLayoutName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.trim().slice(0, LAYOUT_NAME_MAX_LENGTH);
	return name || null;
}

export function nextLayoutName(taken: readonly string[]): string {
	const names = new Set(taken);
	let number = taken.length + 1;
	while (names.has(`Layout ${number}`)) number += 1;
	return `Layout ${number}`;
}

export function normalizeLayoutSnapshot(value: unknown): WorkspaceLayoutSnapshot | null {
	if (!isRecord(value)) return null;
	if (!Array.isArray(value.windowPlacements)) return null;
	if (value.leftWidth !== null && typeof value.leftWidth !== 'number') return null;
	if (typeof value.leftPaneCollapsed !== 'boolean') return null;
	if (typeof value.windowMovementLocked !== 'boolean') return null;

	const leftWidth =
		typeof value.leftWidth === 'number' && Number.isFinite(value.leftWidth) && value.leftWidth > 0
			? Math.round(value.leftWidth)
			: null;

	return {
		windowPlacements: normalizePlacements(value.windowPlacements),
		leftWidth,
		leftPaneCollapsed: value.leftPaneCollapsed,
		windowMovementLocked: value.windowMovementLocked
	};
}

// Unknown window ids are dropped and windows missing from the payload are appended
// from the registry defaults, so a snapshot always covers exactly the known windows.
function normalizePlacements(value: unknown[]): WindowPlacement[] {
	const defaultsById = new Map(DEFAULT_WINDOW_PLACEMENTS.map((item) => [item.id, item]));
	const seen = new Set<string>();
	const result: WindowPlacement[] = [];

	for (const item of value) {
		if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
		const fallback = defaultsById.get(item.id);
		if (!fallback) continue;
		const visible = typeof item.visible === 'boolean' ? item.visible : fallback.visible;
		const height = windowHeight(item.height);
		result.push({
			id: fallback.id,
			column: isWindowColumn(item.column) ? item.column : fallback.column,
			visible,
			collapsed: typeof item.collapsed === 'boolean' ? item.collapsed : fallback.collapsed,
			height: height ?? (visible ? DEFAULT_WINDOW_HEIGHT : fallback.height)
		});
		seen.add(item.id);
	}

	return [...result, ...DEFAULT_WINDOW_PLACEMENTS.filter(({ id }) => !seen.has(id))];
}

function windowHeight(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.round(value))
		: null;
}

function clonePlacements(items: WindowPlacement[]): WindowPlacement[] {
	return items.map((item) => ({ ...item }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWindowColumn(value: unknown): value is WindowColumn {
	return value === WindowColumn.LEFT || value === WindowColumn.RIGHT;
}
