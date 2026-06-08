import { derived, writable } from 'svelte/store';
import { windowDefinitions, type WindowColumn } from './windows';

export type WindowPlacement = {
	id: string;
	column: WindowColumn;
	visible: boolean;
	collapsed: boolean;
};

type WindowDropPlacement = {
	windowId: string | null;
	columnId: string | null;
	columnIndex: number;
};

const definitionsById = new Map(windowDefinitions.map((definition) => [definition.id, definition]));

export const windowPlacements = writable<WindowPlacement[]>(
	windowDefinitions.map((definition) => ({
		id: definition.id,
		column: definition.column,
		visible: true,
		collapsed: false
	}))
);

export const visibleWindows = derived(windowPlacements, ($placements) =>
	$placements
		.filter((placement) => placement.visible)
		.map((placement) => {
			const definition = definitionsById.get(placement.id);
			return definition ? { ...definition, column: placement.column, collapsed: placement.collapsed } : null;
		})
		.filter((definition) => definition !== null)
);

export function showWindow(id: string) {
	windowPlacements.update((placements) =>
		placements.map((placement) =>
			placement.id === id ? { ...placement, visible: true, collapsed: false } : placement
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

export function placeWindowFromDrop({ windowId, columnId, columnIndex }: WindowDropPlacement) {
	if (!windowId || !isWindowColumn(columnId)) return;

	windowPlacements.update((placements) => {
		const moving = placements.find((placement) => placement.id === windowId);
		if (!moving) return placements;

		const nextMoving = { ...moving, column: columnId, visible: true };
		const remaining = placements.filter((placement) => placement.id !== windowId);
		const targetColumnWindows = remaining.filter(
			(placement) => placement.visible && placement.column === columnId
		);
		const before = targetColumnWindows[columnIndex];

		if (before) {
			const insertAt = remaining.findIndex((placement) => placement.id === before.id);
			return [...remaining.slice(0, insertAt), nextMoving, ...remaining.slice(insertAt)];
		}

		const lastTarget = targetColumnWindows.at(-1);
		if (lastTarget) {
			const insertAt = remaining.findIndex((placement) => placement.id === lastTarget.id) + 1;
			return [...remaining.slice(0, insertAt), nextMoving, ...remaining.slice(insertAt)];
		}

		return [...remaining, nextMoving];
	});
}

function isWindowColumn(value: string | null): value is WindowColumn {
	return value === 'left' || value === 'right';
}
