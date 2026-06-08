import { get, writable } from 'svelte/store';
import { dkClient, type ProviderRecord, type UserSettings } from './sdk';
import { currentUser } from './sessionState';

export type AssistantRuntimeState = {
	providerId: string;
	modelId: string;
	templateId: string;
	topK: number;
	providers: ProviderRecord[];
	loaded: boolean;
	loading: boolean;
	error: string | null;
};

const defaultRuntime: AssistantRuntimeState = {
	providerId: '',
	modelId: '',
	templateId: 'rag_chat',
	topK: 8,
	providers: [],
	loaded: false,
	loading: false,
	error: null
};

export const assistantRuntime = writable<AssistantRuntimeState>(defaultRuntime);

type LoadAssistantRuntimeOptions = {
	force?: boolean;
	refresh?: boolean;
};

export async function loadAssistantRuntime({
	force = false,
	refresh = true
}: LoadAssistantRuntimeOptions = {}) {
	const current = get(assistantRuntime);
	if (!force && current.loaded && current.providerId && current.modelId) {
		return current;
	}

	assistantRuntime.update((state) => ({ ...state, loading: true, error: null }));

	try {
		const userId = await currentUserId();
		const [settings, providerData] = await Promise.all([
			dkClient.getSettings(userId),
			dkClient.listProviders({ refresh })
		]);

		const providers = providerData.providers || [];
		const savedProviderId = settingString(settings, 'provider_id', providers[0]?.id || 'ollama');
		const providerId = providers.some((provider) => provider.id === savedProviderId)
			? savedProviderId
			: providers[0]?.id || 'ollama';
		const provider = providers.find((item) => item.id === providerId);
		const modelId = settingString(settings, 'model_id') || firstModelId(provider?.models || []);
		const error = modelId ? null : 'Assistant model is not configured.';

		const next = {
			providerId,
			modelId,
			templateId: settingString(settings, 'prompt_template_id', 'rag_chat'),
			topK: settingNumber(settings, 'top_k', 8),
			providers,
			loaded: true,
			loading: false,
			error
		};

		assistantRuntime.set(next);
		return next;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		assistantRuntime.update((state) => ({
			...state,
			loaded: true,
			loading: false,
			error: message
		}));
		throw error;
	}
}

async function currentUserId() {
	const user = get(currentUser);
	if (user?.user) return user.user;

	const response = await dkClient.getUser();
	return response.user || 'default';
}

function settingString(settings: UserSettings, key: string, fallback = '') {
	const value = settings[key];
	return typeof value === 'string' && value ? value : fallback;
}

function settingNumber(settings: UserSettings, key: string, fallback: number) {
	const value = Number(settings[key]);
	return Number.isFinite(value) ? value : fallback;
}

function firstModelId(models: unknown[]) {
	return models.map(modelOptionId).find(Boolean) || '';
}

function modelOptionId(model: unknown) {
	if (typeof model === 'string') return model;
	if (model && typeof model === 'object') {
		const row = model as Record<string, unknown>;
		return String(row.id ?? row.name ?? row.label ?? '');
	}
	return '';
}
