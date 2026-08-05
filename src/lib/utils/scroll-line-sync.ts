// Maps between a scroll position in a plain-text <textarea> and a scroll
// position in its rendered markdown preview, by source line rather than by
// overall scroll fraction. Rendered HTML (headings, code blocks, spacing)
// doesn't scale 1:1 with raw line count, so matching by height ratio alone
// drifts on real notes; matching by line keeps both panes on the same part
// of the document.

const MIRROR_STYLE_PROPS = [
	'boxSizing',
	'width',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'fontFamily',
	'fontSize',
	'fontWeight',
	'fontStyle',
	'letterSpacing',
	'lineHeight',
	'tabSize'
] as const;

// Pixel offset (from the textarea's content top) of each source line's first
// visual row, accounting for line-wrap the same way the textarea itself does.
export function measureTextareaLineTops(el: HTMLTextAreaElement, text: string): number[] {
	const style = getComputedStyle(el);
	const mirror = document.createElement('div');
	mirror.style.position = 'absolute';
	mirror.style.visibility = 'hidden';
	mirror.style.top = '0';
	mirror.style.left = '-9999px';
	mirror.style.whiteSpace = 'pre-wrap';
	mirror.style.wordWrap = 'break-word';
	mirror.style.borderStyle = 'solid';
	mirror.style.borderColor = 'transparent';
	for (const prop of MIRROR_STYLE_PROPS) {
		mirror.style[prop] = style[prop];
	}

	const fragment = document.createDocumentFragment();
	for (const line of text.split('\n')) {
		const span = document.createElement('span');
		span.style.display = 'block';
		span.textContent = line.length ? line : '​';
		fragment.appendChild(span);
	}
	mirror.appendChild(fragment);
	document.body.appendChild(mirror);
	const tops = Array.from(mirror.children, (span) => (span as HTMLElement).offsetTop);
	document.body.removeChild(mirror);
	return tops;
}

// Largest index whose value is <= target - the line/block occupying the top
// of the viewport at that scroll position.
export function lastAtOrBefore(values: number[], target: number): number {
	let lo = 0;
	let hi = values.length - 1;
	let result = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (values[mid] <= target) {
			result = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return result;
}

export function topWithinScroller(el: Element, scroller: Element): number {
	return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

export function lineAtTextareaScrollTop(el: HTMLTextAreaElement, text: string): number {
	const tops = measureTextareaLineTops(el, text);
	if (!tops.length) return 0;
	return lastAtOrBefore(tops, el.scrollTop);
}

export function scrollTextareaToLine(el: HTMLTextAreaElement, text: string, line: number): void {
	const tops = measureTextareaLineTops(el, text);
	el.scrollTop = tops[Math.max(0, Math.min(line, tops.length - 1))] ?? 0;
}

export function lineAtPreviewScrollTop(scroller: HTMLElement): number {
	const blocks = Array.from(scroller.querySelectorAll<HTMLElement>('[data-line]'));
	let best: HTMLElement | null = null;
	for (const block of blocks) {
		if (topWithinScroller(block, scroller) <= scroller.scrollTop + 1) {
			best = block;
		} else {
			break;
		}
	}
	return best ? Number(best.dataset.line) : 0;
}

export function scrollPreviewToLine(scroller: HTMLElement, line: number): void {
	const blocks = Array.from(scroller.querySelectorAll<HTMLElement>('[data-line]'));
	let target: HTMLElement | null = null;
	for (const block of blocks) {
		const blockLine = Number(block.dataset.line);
		if (blockLine <= line) {
			target = block;
		} else {
			break;
		}
	}
	target ??= blocks[0] ?? null;
	if (target) scroller.scrollTop = topWithinScroller(target, scroller);
}
