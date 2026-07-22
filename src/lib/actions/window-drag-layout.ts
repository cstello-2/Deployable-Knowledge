export type DragPoint = {
	x: number;
	y: number;
};

export type DragPosition = {
	left: number;
	top: number;
};

export type WindowDragLayoutOptions = {
	columnSelector?: string;
	windowSelector?: string;
	handleSelector?: string;
	ignoreSelector?: string;
	modalSelector?: string;
	draggingClass?: string;
	dropCandidateClass?: string;
	dropMarkerClass?: string;
	disabled?: boolean;
};

type ResolvedWindowDragLayoutOptions = Required<WindowDragLayoutOptions>;

type InlineSnapshot = {
	left: string;
	top: string;
	position: string;
	width: string;
	pointerEvents: string;
};

type DragState = {
	win: HTMLElement;
	isModalDrag: boolean;
	winStart: DragPoint;
	pointerStart: DragPoint;
	inline: InlineSnapshot;
};

type WindowDropDetail = {
	windowId: string | null;
	columnId: string | null;
	columnIndex: number;
};

const defaultOptions: ResolvedWindowDragLayoutOptions = {
	columnSelector: '[data-window-column]',
	windowSelector: '[data-window-id]',
	handleSelector: '[data-window-handle]',
	ignoreSelector: '[data-window-action], .actions, .icon-btn, button, a, input, select, textarea',
	modalSelector: '[data-window-modal="true"], .modal',
	draggingClass: 'dragging',
	dropCandidateClass: 'drop-candidate',
	dropMarkerClass: 'drop-marker',
	disabled: false
};

export function calcDragPosition(
	winStart: DragPoint,
	pointerStart: DragPoint,
	event: Pick<PointerEvent, 'clientX' | 'clientY'>
): DragPosition {
	return {
		left: winStart.x + (event.clientX - pointerStart.x),
		top: winStart.y + (event.clientY - pointerStart.y)
	};
}

export function findDraggableWindow(
	event: PointerEvent,
	root: HTMLElement,
	options: WindowDragLayoutOptions = {}
): HTMLElement | null {
	const settings = resolveOptions(options);
	const target = event.target;
	if (!(target instanceof Element)) return null;
	if (target.closest(settings.ignoreSelector)) return null;

	const handle = target.closest(settings.handleSelector);
	if (!handle || !root.contains(handle)) return null;

	const win = handle.closest(settings.windowSelector);
	if (!(win instanceof HTMLElement) || !root.contains(win)) return null;

	return win;
}

export function windowDragLayout(node: HTMLElement, options: WindowDragLayoutOptions = {}) {
	let settings = resolveOptions(options);
	let drag: DragState | null = null;
	const dropMarker = document.createElement('div');
	dropMarker.className = settings.dropMarkerClass;

	function columns() {
		return Array.from(node.querySelectorAll<HTMLElement>(settings.columnSelector));
	}

	function getDropColumnAt(x: number, y: number) {
		const hit = document
			.elementsFromPoint(x, y)
			.find(
				(element) =>
					element instanceof HTMLElement &&
					node.contains(element) &&
					element.matches(settings.columnSelector)
			);

		return hit instanceof HTMLElement ? hit : null;
	}

	function clearDropState() {
		for (const col of columns()) col.classList.remove(settings.dropCandidateClass);
		node.classList.remove(settings.draggingClass);
		dropMarker.remove();
	}

	function restoreInlineStyles(state: DragState) {
		state.win.classList.remove(settings.draggingClass);
		state.win.style.left = state.inline.left;
		state.win.style.top = state.inline.top;
		state.win.style.position = state.inline.position;
		state.win.style.width = state.inline.width;
		state.win.style.pointerEvents = state.inline.pointerEvents;
		state.win.style.removeProperty('--drag-w');
	}

	function getDropColumnIndex(win: HTMLElement, column: HTMLElement | null) {
		if (!column) return -1;

		if (dropMarker.parentElement === column) {
			const ordered = Array.from(column.children).filter((child) => {
				if (child === dropMarker) return true;
				if (child === win) return false;
				if (!(child instanceof HTMLElement)) return false;
				return child.matches(settings.windowSelector);
			});
			return ordered.indexOf(dropMarker);
		}

		return Array.from(column.querySelectorAll<HTMLElement>(settings.windowSelector)).filter(
			(candidate) => candidate !== win
		).length;
	}

	function emitDrop(win: HTMLElement, column: HTMLElement | null, columnIndex: number) {
		const detail: WindowDropDetail = {
			windowId: win.dataset.windowId ?? win.id,
			columnId: column?.dataset.windowColumn ?? column?.id ?? null,
			columnIndex
		};

		node.dispatchEvent(new CustomEvent('windowdrop', { detail }));
	}

	function placeDropMarker(over: HTMLElement, event: PointerEvent) {
		const siblings = Array.from(over.querySelectorAll<HTMLElement>(settings.windowSelector)).filter(
			(candidate) => candidate !== drag?.win
		);

		for (const sibling of siblings) {
			const rect = sibling.getBoundingClientRect();
			if (event.clientY < rect.top + rect.height / 2) {
				over.insertBefore(dropMarker, sibling);
				return;
			}
		}

		over.appendChild(dropMarker);
	}

	function onMove(event: PointerEvent) {
		if (!drag) return;

		const pos = calcDragPosition(drag.winStart, drag.pointerStart, event);
		drag.win.style.left = `${pos.left}px`;
		drag.win.style.top = `${pos.top}px`;

		if (drag.isModalDrag) return;

		for (const col of columns()) col.classList.remove(settings.dropCandidateClass);

		const over = getDropColumnAt(event.clientX, event.clientY);
		if (!over) {
			dropMarker.remove();
			return;
		}

		over.classList.add(settings.dropCandidateClass);
		placeDropMarker(over, event);
	}

	function onUp(event: PointerEvent) {
		if (!drag) return;

		const state = drag;
		drag = null;

		let targetColumn: HTMLElement | null = null;
		let columnIndex = -1;
		if (!state.isModalDrag) {
			targetColumn = dropMarker.parentElement ?? getDropColumnAt(event.clientX, event.clientY);
			if (targetColumn) {
				columnIndex = getDropColumnIndex(state.win, targetColumn);
				state.win.focus({ preventScroll: true });
			}
		}

		restoreInlineStyles(state);
		clearDropState();
		emitDrop(state.win, targetColumn, columnIndex);
		document.removeEventListener('pointermove', onMove);
	}

	function onTitlebarDown(event: PointerEvent) {
		if (settings.disabled || !event.isPrimary || event.button !== 0 || drag) return;

		const win = findDraggableWindow(event, node, settings);
		if (!win) return;

		event.preventDefault();

		const rect = win.getBoundingClientRect();
		drag = {
			win,
			isModalDrag: win.matches(settings.modalSelector),
			winStart: { x: rect.left, y: rect.top },
			pointerStart: { x: event.clientX, y: event.clientY },
			inline: {
				left: win.style.left,
				top: win.style.top,
				position: win.style.position,
				width: win.style.width,
				pointerEvents: win.style.pointerEvents
			}
		};

		win.classList.add(settings.draggingClass);
		win.style.setProperty('--drag-w', `${rect.width}px`);
		win.style.left = `${rect.left}px`;
		win.style.top = `${rect.top}px`;
		win.style.pointerEvents = 'none';

		if (!drag.isModalDrag) node.classList.add(settings.draggingClass);

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp, { once: true });
	}

	node.addEventListener('pointerdown', onTitlebarDown);

	return {
		update(nextOptions: WindowDragLayoutOptions = {}) {
			settings = resolveOptions(nextOptions);
			dropMarker.className = settings.dropMarkerClass;
		},
		destroy() {
			node.removeEventListener('pointerdown', onTitlebarDown);
			document.removeEventListener('pointermove', onMove);
			clearDropState();
			if (drag) restoreInlineStyles(drag);
			drag = null;
		}
	};
}

function resolveOptions(options: WindowDragLayoutOptions): ResolvedWindowDragLayoutOptions {
	return {
		...defaultOptions,
		...options
	};
}
