export type SettingsSection = 'agent' | 'tools' | 'models' | 'appearance' | 'diagnostics';

class SettingsDialogStore {
	open = $state(false);
	section = $state<SettingsSection>('agent');

	show(section?: SettingsSection): void {
		if (section) this.section = section;
		this.open = true;
	}

	close(): void {
		this.open = false;
	}
}

export const settingsDialogStore = new SettingsDialogStore();
