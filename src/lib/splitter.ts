export type ColumnSplitterOptions = {
	leftSelector?: string;
	rightSelector?: string;
	splitterSelector?: string;
	storageKey?: string;
	minLeftPx?: number;
	minRightPx?: number;
	minLeftRatio?: number;
	defaultLeftRatio?: number;
};

type ResolvedColumnSplitterOptions = Required<ColumnSplitterOptions>;

const defaultOptions: ResolvedColumnSplitterOptions = {
	leftSelector: '[data-split-pane="left"]',
	rightSelector: '[data-split-pane="right"]',
	splitterSelector: '[data-splitter]',
	storageKey: 'layout:leftWidth',
	minLeftPx: 300,
	minRightPx: 320,
	minLeftRatio: 0.28,
	defaultLeftRatio: 0.42
};

export function columnSplitter(node: HTMLElement, options: ColumnSplitterOptions = {}) {
	let settings = resolveOptions(options);
	let left = queryRequired(node, settings.leftSelector);
	let right = queryRequired(node, settings.rightSelector);
	let splitter = queryRequired(node, settings.splitterSelector);
	let dragging = false;
	let startPoint = 0;
	let leftStartSize = 0;

	function isStacked() {
		return getComputedStyle(node).flexDirection.startsWith('column');
	}

	function primaryPoint(event: PointerEvent) {
		return isStacked() ? event.clientY : event.clientX;
	}

	function leftSize() {
		const rect = left.getBoundingClientRect();
		return isStacked() ? rect.height : rect.width;
	}

	function totalSize() {
		const splitterRect = splitter.getBoundingClientRect();
		return isStacked() ? node.clientHeight - splitterRect.height : node.clientWidth - splitterRect.width;
	}

	function applyLeftWidth(px: number) {
		const total = totalSize();
		const minLeft = Math.min(Math.max(settings.minLeftPx, total * settings.minLeftRatio), total / 2);
		const maxLeft = Math.max(minLeft, total - settings.minRightPx);
		const clamped = Math.min(maxLeft, Math.max(minLeft, px));

		left.style.flex = `0 0 ${clamped}px`;
		right.style.flex = '1 1 auto';
	}

	function onDown(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;

		event.preventDefault();
		dragging = true;
		startPoint = primaryPoint(event);
		leftStartSize = leftSize();
		splitter.classList.add('dragging');

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp, { once: true });
	}

	function onMove(event: PointerEvent) {
		if (!dragging) return;
		applyLeftWidth(leftStartSize + (primaryPoint(event) - startPoint));
	}

	function onUp() {
		if (!dragging) return;

		dragging = false;
		splitter.classList.remove('dragging');
		localStorage.setItem(settings.storageKey, String(Math.round(leftSize())));
		document.removeEventListener('pointermove', onMove);
	}

	function onResize() {
		applyLeftWidth(Math.round(leftSize()));
	}

	function setup() {
		const saved = Number(localStorage.getItem(settings.storageKey));
		const fallback = Math.round(
			(isStacked() ? window.innerHeight : window.innerWidth) * settings.defaultLeftRatio
		);
		applyLeftWidth(Number.isFinite(saved) && saved > 0 ? saved : fallback);
	}

	splitter.addEventListener('pointerdown', onDown);
	window.addEventListener('resize', onResize);
	setup();

	return {
		update(nextOptions: ColumnSplitterOptions = {}) {
			settings = resolveOptions(nextOptions);
			left = queryRequired(node, settings.leftSelector);
			right = queryRequired(node, settings.rightSelector);
			splitter.removeEventListener('pointerdown', onDown);
			splitter = queryRequired(node, settings.splitterSelector);
			splitter.addEventListener('pointerdown', onDown);
			setup();
		},
		destroy() {
			splitter.removeEventListener('pointerdown', onDown);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('pointermove', onMove);
		}
	};
}

function resolveOptions(options: ColumnSplitterOptions): ResolvedColumnSplitterOptions {
	return {
		...defaultOptions,
		...options
	};
}

function queryRequired(root: HTMLElement, selector: string): HTMLElement {
	const element = root.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Missing splitter element: ${selector}`);
	return element;
}
