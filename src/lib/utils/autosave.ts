export interface Autosave {
	destroy: () => void;
	flush: () => Promise<void>;
	pending: () => boolean;
	schedule: () => void;
}

export function createAutosave(save: () => Promise<void>, delay = 350): Autosave {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending = false;

	async function flush(): Promise<void> {
		if (timer) clearTimeout(timer);
		timer = null;
		if (!pending) return;
		pending = false;
		await save();
	}

	return {
		schedule() {
			pending = true;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => void flush(), delay);
		},
		flush,
		pending() {
			return pending;
		},
		destroy() {
			void flush();
		}
	};
}
