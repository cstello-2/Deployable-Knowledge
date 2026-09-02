const PREFETCH_MARGIN = '320px 0px';

export interface InfiniteScrollOptions {
	disabled?: boolean;
	onLoadMore: () => void;
	root?: Element | null;
}

export function infiniteScroll(node: HTMLElement, initialOptions: InfiniteScrollOptions) {
	let options = initialOptions;
	let observer: IntersectionObserver | null = null;
	// Height of the scrolled content when the last page was requested. The sentinel
	// re-arms once a load finishes so a short list keeps filling the viewport, but a
	// page whose documents land in a collapsed group renders nothing and leaves the
	// sentinel in view. Without this the re-arm fires straight back and the list
	// walks the whole corpus into the DOM.
	let requestedAtHeight = -1;

	function contentHeight(): number {
		return options.root?.scrollHeight ?? node.ownerDocument.documentElement.scrollHeight;
	}

	function requestMore(): void {
		const height = contentHeight();
		if (height === requestedAtHeight) return;
		requestedAtHeight = height;
		options.onLoadMore();
	}

	function observe(): void {
		observer?.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				if (options.disabled) return;
				if (entries.some((entry) => entry.isIntersecting)) requestMore();
			},
			{ root: options.root ?? null, rootMargin: PREFETCH_MARGIN }
		);
		observer.observe(node);
	}

	observe();

	return {
		update(nextOptions: InfiniteScrollOptions) {
			const rootChanged = nextOptions.root !== options.root;
			const reobserve = rootChanged || (options.disabled && !nextOptions.disabled);
			options = nextOptions;
			if (rootChanged) requestedAtHeight = -1;
			if (reobserve) observe();
		},
		destroy() {
			observer?.disconnect();
		}
	};
}
