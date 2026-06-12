export type ColumnSplitterOptions = {
  leftSelector?: string;
  rightSelector?: string;
  splitterSelector?: string;
  minLeftPx?: number;
  minRightPx?: number;
  minLeftRatio?: number;
  defaultLeftRatio?: number;
  leftCollapsed?: boolean;
  leftWidth?: number | null;
  onLeftWidthChange?: (width: number) => void;
};

type ResolvedColumnSplitterOptions = Required<ColumnSplitterOptions>;

const defaultOptions: ResolvedColumnSplitterOptions = {
  leftSelector: '[data-split-pane="left"]',
  rightSelector: '[data-split-pane="right"]',
  splitterSelector: "[data-splitter]",
  minLeftPx: 300,
  minRightPx: 320,
  minLeftRatio: 0.28,
  defaultLeftRatio: 0.42,
  leftCollapsed: false,
  leftWidth: null,
  onLeftWidthChange: () => {},
};

export function columnSplitter(
  node: HTMLElement,
  options: ColumnSplitterOptions = {},
) {
  let settings = resolveOptions(options);
  let left = queryRequired(node, settings.leftSelector);
  let right = queryRequired(node, settings.rightSelector);
  let splitter = queryRequired(node, settings.splitterSelector);
  let dragging = false;
  let startPoint = 0;
  let leftStartSize = 0;

  function isStacked() {
    return getComputedStyle(node).flexDirection.startsWith("column");
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
    return isStacked()
      ? node.clientHeight - splitterRect.height
      : node.clientWidth - splitterRect.width;
  }

  function applyLeftWidth(px: number) {
    splitter.style.display = "";

    const total = totalSize();
    const minLeft = Math.min(
      Math.max(settings.minLeftPx, total * settings.minLeftRatio),
      total / 2,
    );
    const maxLeft = Math.max(minLeft, total - settings.minRightPx);
    const clamped = Math.min(maxLeft, Math.max(minLeft, px));

    left.style.flex = `0 0 ${clamped}px`;
    right.style.flex = "1 1 auto";

    return clamped;
  }

  function applyCollapsed() {
    left.style.flex = "0 0 0px";
    right.style.flex = "1 1 auto";
    splitter.style.display = "none";
  }

  function onDown(event: PointerEvent) {
    if (settings.leftCollapsed) return;
    if (!event.isPrimary || event.button !== 0) return;

    event.preventDefault();
    dragging = true;
    startPoint = primaryPoint(event);
    leftStartSize = leftSize();
    splitter.classList.add("dragging");

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }

  function onMove(event: PointerEvent) {
    if (!dragging) return;
    applyLeftWidth(leftStartSize + (primaryPoint(event) - startPoint));
  }

  function onUp() {
    if (!dragging) return;

    dragging = false;
    splitter.classList.remove("dragging");
    const currentLeftSize = Math.round(leftSize());
    settings.onLeftWidthChange(currentLeftSize);
    document.removeEventListener("pointermove", onMove);
  }

  function onResize() {
    if (settings.leftCollapsed) return;

    const currentLeftSize = applyLeftWidth(Math.round(leftSize()));
    settings.onLeftWidthChange(Math.round(currentLeftSize));
  }

  function setup() {
    if (settings.leftCollapsed) {
      applyCollapsed();
      return;
    }

    const fallback = Math.round(
      (isStacked() ? window.innerHeight : window.innerWidth) *
        settings.defaultLeftRatio,
    );
    const nextWidth = settings.leftWidth ?? fallback;
    const appliedWidth = applyLeftWidth(nextWidth);

    settings.onLeftWidthChange(Math.round(appliedWidth));
  }

  splitter.addEventListener("pointerdown", onDown);
  window.addEventListener("resize", onResize);
  setup();

  return {
    update(nextOptions: ColumnSplitterOptions = {}) {
      settings = resolveOptions(nextOptions);
      left = queryRequired(node, settings.leftSelector);
      right = queryRequired(node, settings.rightSelector);
      splitter.removeEventListener("pointerdown", onDown);
      splitter = queryRequired(node, settings.splitterSelector);
      splitter.addEventListener("pointerdown", onDown);
      setup();
    },
    destroy() {
      splitter.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointermove", onMove);
    },
  };
}

function resolveOptions(
  options: ColumnSplitterOptions,
): ResolvedColumnSplitterOptions {
  return {
    ...defaultOptions,
    ...options,
  };
}

function queryRequired(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement))
    throw new Error(`Missing splitter element: ${selector}`);
  return element;
}

export type NotebookSplitterOptions = {
	mainSelector?: string;
	notebookSelector?: string;
	splitterSelector?: string;
	storageKey?: string;
	minNotebookPx?: number;
	maxNotebookPx?: number;
	defaultNotebookPx?: number;
};

type ResolvedNotebookSplitterOptions = Required<NotebookSplitterOptions>;

const defaultNotebookOptions: ResolvedNotebookSplitterOptions = {
	mainSelector: '[data-split-pane="main-workspace"]',
	notebookSelector: '[data-split-pane="notebook"]',
	splitterSelector: '[data-notebook-splitter]',
	storageKey: 'layout:notebookWidth',
	minNotebookPx: 260,
	maxNotebookPx: 560,
	defaultNotebookPx: 360
};

export function notebookSplitter(node: HTMLElement, options: NotebookSplitterOptions = {}) {
	const settings: ResolvedNotebookSplitterOptions = {
		...defaultNotebookOptions,
		...options
	};

	const main = queryRequired(node, settings.mainSelector);
	const notebook = queryRequired(node, settings.notebookSelector);
	const splitter = queryRequired(node, settings.splitterSelector);

	let dragging = false;
	let startX = 0;
	let startNotebookWidth = 0;

	function notebookWidth() {
		return notebook.getBoundingClientRect().width;
	}

	function applyNotebookWidth(px: number) {
		const availableWidth = node.clientWidth - splitter.getBoundingClientRect().width;
		const maxNotebook = Math.min(settings.maxNotebookPx, availableWidth - 520);

		const clamped = Math.max(
			settings.minNotebookPx,
			Math.min(maxNotebook, px)
		);

		main.style.flex = '1 1 auto';
		main.style.minWidth = '0';

		notebook.style.width = `${clamped}px`;
		notebook.style.flex = `0 0 ${clamped}px`;
		notebook.style.minWidth = `${settings.minNotebookPx}px`;
		notebook.style.maxWidth = `${settings.maxNotebookPx}px`;
	}

	function onDown(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;

		event.preventDefault();

		dragging = true;
		startX = event.clientX;
		startNotebookWidth = notebookWidth();

		splitter.classList.add('dragging');

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp, { once: true });
	}

	function onMove(event: PointerEvent) {
		if (!dragging) return;

		const delta = event.clientX - startX;

		// Dragging left should make the notebook wider.
		// Dragging right should make it smaller.
		applyNotebookWidth(startNotebookWidth - delta);
	}

	function onUp() {
		if (!dragging) return;

		dragging = false;
		splitter.classList.remove('dragging');

		localStorage.setItem(settings.storageKey, String(Math.round(notebookWidth())));

		document.removeEventListener('pointermove', onMove);
	}

	function onResize() {
		applyNotebookWidth(notebookWidth());
	}

	const saved = Number(localStorage.getItem(settings.storageKey));
	applyNotebookWidth(Number.isFinite(saved) && saved > 0 ? saved : settings.defaultNotebookPx);

	splitter.addEventListener('pointerdown', onDown);
	window.addEventListener('resize', onResize);

	return {
		destroy() {
			splitter.removeEventListener('pointerdown', onDown);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('pointermove', onMove);
		}
	};
}