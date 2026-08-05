import { STORAGE_KEYS } from '$lib/constants';

class WelcomeStore {
	open = $state(false);

	init(): void {
		if (typeof localStorage === 'undefined') return;
		if (localStorage.getItem(STORAGE_KEYS.WELCOME_SEEN) !== 'true') this.open = true;
	}

	show(): void {
		this.open = true;
	}

	close(): void {
		this.open = false;
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEYS.WELCOME_SEEN, 'true');
	}
}

export const welcomeStore = new WelcomeStore();
