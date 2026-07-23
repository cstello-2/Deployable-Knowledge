import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { ProfilesService, PromptTemplatesService, ProvidersService } from '$lib/services';
import type {
	AssistantConfig,
	AssistantProfile,
	AssistantProfileCreateValues,
	AssistantProfileUpdateValues,
	AssistantProfileValues,
	ApiPromptTemplateRequest,
	ApiProviderModelGroup,
	PromptTemplate
} from '$lib/types';

class SettingsStore {
	private initialized = false;
	private _config = $state<AssistantConfig>({ ...DEFAULT_ASSISTANT_CONFIG });
	profiles = $state<AssistantProfile[]>([]);
	promptTemplates = $state<PromptTemplate[]>([]);
	providerModelGroups = $state<ApiProviderModelGroup[]>([]);
	activeProfileId = $state<string | null>(null);
	loading = $state(false);
	ready = $state(false);
	error = $state<string | null>(null);
	lastQuery = $state('');

	get config(): AssistantConfig {
		return this._config;
	}

	get activeProfile(): AssistantProfile | null {
		return this.profiles.find(({ id }) => id === this.activeProfileId) ?? null;
	}

	updateConfig(values: Partial<AssistantConfig>): void {
		this._config = { ...this._config, ...values };
	}

	async init(): Promise<void> {
		if (this.initialized || this.loading) return;
		this.loading = true;
		this.ready = false;
		this.error = null;
		try {
			await this.loadActiveProfile();
			await Promise.all([this.loadProfiles(), this.loadPromptTemplates(), this.loadProviders()]);
			this.initialized = true;
		} catch (error) {
			this.error = message(error);
		} finally {
			this.loading = false;
			this.ready = true;
		}
	}

	async loadActiveProfile(): Promise<void> {
		const profile = await ProfilesService.getActive();
		this.applyProfile(profile);
	}

	async loadProfiles(): Promise<void> {
		const result = await ProfilesService.list();
		this.profiles = result.profiles;
		this.activeProfileId = result.activeProfileId;
	}

	async activateProfile(id: string): Promise<void> {
		const result = await ProfilesService.activate(id);
		this.activeProfileId = result.activeProfileId;
		this.applyProfile(result.profile);
	}

	async createProfile(name: string): Promise<void> {
		const values: AssistantProfileCreateValues = { name, ...this.profileValues() };
		const profile = await ProfilesService.create(values);
		await this.loadProfiles();
		await this.activateProfile(profile.id);
	}

	async saveProfile(name?: string): Promise<void> {
		if (!this.activeProfileId) return;
		const values: AssistantProfileUpdateValues = {
			...this.profileValues(),
			...(name ? { name } : {})
		};
		const profile = await ProfilesService.update(this.activeProfileId, values);
		this.applyProfile(profile);
		await this.loadProfiles();
	}

	async saveActive(): Promise<void> {
		if (!this.activeProfileId) return;
		const profile = await ProfilesService.updateActive(this.profileValues());
		this.applyProfile(profile);
	}

	async deleteProfile(id: string): Promise<void> {
		const wasActive = this.activeProfileId === id;
		await ProfilesService.delete(id);
		await this.loadProfiles();
		if (wasActive) {
			this.activeProfileId = null;
			const next = this.profiles[0];
			if (next) await this.activateProfile(next.id);
		}
	}

	async loadPromptTemplates(): Promise<void> {
		this.promptTemplates = await PromptTemplatesService.list();
		if (
			this._config.promptTemplateId &&
			!this.promptTemplates.some(({ id }) => id === this._config.promptTemplateId)
		) {
			this.updateConfig({ promptTemplateId: null });
		}
	}

	async savePromptTemplate(id: string | undefined, value: ApiPromptTemplateRequest): Promise<void> {
		const template = id
			? await PromptTemplatesService.update(id, value)
			: await PromptTemplatesService.create(value);
		await this.loadPromptTemplates();
		this.updateConfig({ promptTemplateId: template.id });
		await this.saveActive();
	}

	async deletePromptTemplate(id: string): Promise<void> {
		await PromptTemplatesService.delete(id);
		if (this._config.promptTemplateId === id) this.updateConfig({ promptTemplateId: null });
		await this.loadPromptTemplates();
		await this.saveActive();
	}

	async loadProviders(): Promise<void> {
		this.providerModelGroups = await ProvidersService.listModelGroups();
		const selected = this.providerModelGroups.find(({ id }) => id === this._config.provider);
		if (selected?.models.includes(this._config.model)) return;
		const first = this.providerModelGroups.find(({ models }) => models.length);
		if (first) this.updateConfig({ provider: first.id, model: first.models[0] });
	}

	private applyProfile(profile: AssistantProfile | null): void {
		this.activeProfileId = profile?.id ?? null;
		if (!profile) return;
		this._config = {
			provider: profile.provider,
			model: profile.model,
			maxTokens: profile.maxTokens,
			temperature: profile.temperature,
			topK: profile.topK,
			reasoningBudget: profile.reasoningBudget,
			retrievalMode: profile.retrievalMode as RetrievalMode,
			ragTopK: profile.ragTopK,
			agentMaxTurns: profile.agentMaxTurns,
			promptTemplateId: profile.promptTemplateId,
			persona: profile.persona ?? ''
		};
	}

	private profileValues(): AssistantProfileValues {
		return {
			...this._config,
			retrievalMode: this._config.retrievalMode,
			persona: this._config.persona
		};
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const settingsStore = new SettingsStore();
