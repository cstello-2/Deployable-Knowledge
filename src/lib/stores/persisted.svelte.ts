import { browser } from '$app/environment';

interface PersistedValue<T> {
	get value(): T;
	set value(value: T);
}

export function persisted<T>(key: string, initialValue: T): PersistedValue<T> {
	let value = $state(initialValue);
	if (browser) {
		try {
			const stored = localStorage.getItem(key);
			if (stored !== null) value = JSON.parse(stored) as T;
		} catch (error) {
			console.warn(`Failed to load ${key}:`, error);
		}
	}

	return {
		get value() {
			return value;
		},
		set value(next: T) {
			value = next;
			if (!browser) return;
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch (error) {
				console.warn(`Failed to persist ${key}:`, error);
			}
		}
	};
}
