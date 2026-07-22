export interface NotebookAutosave {
	destroy: () => void;
	flush: () => Promise<void>;
	schedule: () => void;
}

export function createNotebookAutosave(save: () => Promise<void>, delay = 350): NotebookAutosave {
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
		destroy() {
			void flush();
		}
	};
}
