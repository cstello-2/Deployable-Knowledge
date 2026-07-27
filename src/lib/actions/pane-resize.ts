const DEFAULT_MIN_HEIGHT = 120;
const COLLAPSED_MIN_HEIGHT = 36;

export interface PaneResizeOptions {
	afterId: string;
	afterCollapsed?: boolean;
	beforeId: string;
	beforeCollapsed?: boolean;
	onResize: (updates: { id: string; height: number }[]) => void;
	onResizeStateChange?: (active: boolean) => void;
}

export function paneResize(node: HTMLElement, initialOptions: PaneResizeOptions) {
	let options = initialOptions;
	let cleanup: (() => void) | null = null;

	function onPointerDown(event: PointerEvent): void {
		if (!event.isPrimary || event.button !== 0) return;

		const container = node.closest<HTMLElement>('[data-window-column]');
		const before = findWindow(container, options.beforeId);
		const after = findWindow(container, options.afterId);
		if (!before || !after) return;

		event.preventDefault();
		event.stopPropagation();

		const beforeStart = before.getBoundingClientRect().height;
		const afterStart = after.getBoundingClientRect().height;
		const totalHeight = beforeStart + afterStart;
		const minBefore = Math.min(minHeight(options.beforeCollapsed), totalHeight);
		const minAfter = Math.min(minHeight(options.afterCollapsed), totalHeight);
		const maxBefore = Math.max(minBefore, totalHeight - minAfter);
		const pointerStart = event.clientY;
		const previousCursor = document.documentElement.style.cursor;
		const previousUserSelect = document.body.style.userSelect;

		node.classList.add('dragging');
		options.onResizeStateChange?.(true);
		document.documentElement.style.cursor = 'row-resize';
		document.body.style.userSelect = 'none';

		const onMove = (moveEvent: PointerEvent) => {
			const rawHeight = beforeStart + moveEvent.clientY - pointerStart;
			const beforeHeight = Math.min(maxBefore, Math.max(minBefore, rawHeight));
			const afterHeight = Math.max(minAfter, totalHeight - beforeHeight);
			options.onResize([
				{ id: options.beforeId, height: beforeHeight },
				{ id: options.afterId, height: afterHeight }
			]);
		};

		const stop = () => {
			node.classList.remove('dragging');
			options.onResizeStateChange?.(false);
			document.documentElement.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', stop);
			document.removeEventListener('pointercancel', stop);
			cleanup = null;
		};

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', stop, { once: true });
		document.addEventListener('pointercancel', stop, { once: true });
		cleanup = stop;
	}

	node.addEventListener('pointerdown', onPointerDown);

	return {
		update(nextOptions: PaneResizeOptions) {
			options = nextOptions;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			cleanup?.();
		}
	};
}

function findWindow(container: HTMLElement | null, id: string): HTMLElement | null {
	return (
		Array.from(container?.querySelectorAll<HTMLElement>('[data-window-id]') ?? []).find(
			(element) => element.dataset.windowId === id
		) ?? null
	);
}

function minHeight(collapsed = false): number {
	return collapsed ? COLLAPSED_MIN_HEIGHT : DEFAULT_MIN_HEIGHT;
}
