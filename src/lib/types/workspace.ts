import type { WindowColumn } from '$lib/enums';

export interface WindowPlacement {
	id: string;
	column: WindowColumn;
	visible: boolean;
	collapsed: boolean;
	height: number | null;
}

export interface WindowDropPlacement {
	windowId: string | null;
	columnId: string | null;
	columnIndex: number;
}

export interface WorkspaceLayoutSnapshot {
	windowPlacements: WindowPlacement[];
	leftWidth: number | null;
	leftPaneCollapsed: boolean;
	windowMovementLocked: boolean;
}
