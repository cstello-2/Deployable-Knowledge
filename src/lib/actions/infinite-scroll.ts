const PREFETCH_MARGIN = '320px 0px';

export interface InfiniteScrollOptions {
	disabled?: boolean;
	onLoadMore: () => void;
	root?: Element | null;
}

export function infiniteScroll(node: HTMLElement, initialOptions: InfiniteScrollOptions) {
	let options = initialOptions;
	let observer: IntersectionObserver | null = null;

	function observe(): void {
		observer?.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				if (options.disabled) return;
				if (entries.some((entry) => entry.isIntersecting)) options.onLoadMore();
			},
			{ root: options.root ?? null, rootMargin: PREFETCH_MARGIN }
		);
		observer.observe(node);
	}

	observe();

	return {
		update(nextOptions: InfiniteScrollOptions) {
			const reobserve =
				nextOptions.root !== options.root || (options.disabled && !nextOptions.disabled);
			options = nextOptions;
			if (reobserve) observe();
		},
		destroy() {
			observer?.disconnect();
		}
	};
}
