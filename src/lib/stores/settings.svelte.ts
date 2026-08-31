import { toast } from 'svelte-sonner';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import {
	ProfilesService,
	PromptTemplatesService,
	ProvidersService,
	ToolsService
} from '$lib/services';
import type {
	AssistantConfig,
	AssistantProfile,
	AssistantProfileCreateValues,
	AssistantProfileValues,
	ApiAgentTool,
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
	availableTools = $state<ApiAgentTool[]>([]);
	activeProfileId = $state<string | null>(null);
	loading = $state(false);
	ready = $state(false);
	error = $state<string | null>(null);
	lastQuery = $state('');
	modelToolSupport = $state<'unknown' | 'supported' | 'unsupported'>('unknown');
	private capabilityRequestId = 0;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

	get config(): AssistantConfig {
		return this._config;
	}

	get activeProfile(): AssistantProfile | null {
		return this.profiles.find(({ id }) => id === this.activeProfileId) ?? null;
	}

	updateConfig(values: Partial<AssistantConfig>): void {
		this._config = { ...this._config, ...values };
		if ('provider' in values || 'model' in values) {
			void this.refreshModelCapability();
		}
		this.queueAutosave();
	}

	private queueAutosave(): void {
		if (!this.initialized || !this.activeProfileId) return;
		this.clearAutosave();
		this.autosaveTimer = setTimeout(() => {
			this.autosaveTimer = null;
			this.autosaveActive().catch((error) => toast.error(message(error)));
		}, 600);
	}

	private async autosaveActive(): Promise<void> {
		if (!this.activeProfileId) return;
		const profile = await ProfilesService.updateActive(this.profileValues());
		const index = this.profiles.findIndex(({ id }) => id === profile.id);
		if (index >= 0) this.profiles[index] = profile;
	}

	private clearAutosave(): void {
		if (this.autosaveTimer) {
			clearTimeout(this.autosaveTimer);
			this.autosaveTimer = null;
		}
	}

	async refreshModelCapability(): Promise<void> {
		const { provider, model } = this._config;
		const requestId = ++this.capabilityRequestId;
		this.modelToolSupport = 'unknown';
		if (!provider || !model) return;
		try {
			const result = await ProvidersService.getModelCapabilities(provider, model);
			if (requestId !== this.capabilityRequestId) return;
			this.modelToolSupport = result.tools ? 'supported' : 'unsupported';
		} catch {
			if (requestId === this.capabilityRequestId) this.modelToolSupport = 'supported';
		}
	}

	async init(): Promise<void> {
		if (this.initialized || this.loading) return;
		this.loading = true;
		this.ready = false;
		this.error = null;
		try {
			await this.loadTools();
			await this.loadActiveProfile();
			await Promise.all([this.loadProfiles(), this.loadPromptTemplates(), this.loadProviders()]);
			this.initialized = true;
			void this.refreshModelCapability();
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

	async saveActive(): Promise<void> {
		this.clearAutosave();
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

	async loadTools(): Promise<void> {
		this.availableTools = await ToolsService.list();
		this.updateConfig({ enabledTools: this.knownToolIds(this._config.enabledTools) });
	}

	private knownToolIds(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return this.availableTools
				.filter(({ defaultEnabled }) => defaultEnabled !== false)
				.map(({ id }) => id);
		}
		return this.availableTools.map(({ id }) => id).filter((id) => value.includes(id));
	}

	async loadProviders(): Promise<void> {
		this.providerModelGroups = await ProvidersService.listModelGroups();
		const selected = this.providerModelGroups.find(({ id }) => id === this._config.provider);
		if (selected?.models.includes(this._config.model)) return;
		const first = this.providerModelGroups.find(({ models }) => models.length);
		if (first) this.updateConfig({ provider: first.id, model: first.models[0] });
	}

	private applyProfile(profile: AssistantProfile | null): void {
		this.clearAutosave();
		this.activeProfileId = profile?.id ?? null;
		if (!profile) return;
		const modelChanged =
			profile.provider !== this._config.provider || profile.model !== this._config.model;
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
			contextSize: profile.contextSize ?? null,
			gpuMode: profile.gpuMode ?? 'auto',
			promptTemplateId: profile.promptTemplateId,
			persona: profile.persona ?? '',
			enabledTools: this.knownToolIds(profile.enabledTools)
		};
		if (modelChanged || this.modelToolSupport === 'unknown') {
			void this.refreshModelCapability();
		}
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
