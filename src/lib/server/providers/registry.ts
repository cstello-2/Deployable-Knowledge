import type { CustomProviderType } from '$lib/constants';
import type { CustomProviderRecord } from '$lib/server/database/schema';
import { CustomProvidersRepository } from '$lib/server/repositories';
import { LlamaCpp } from './llamacpp';
import { Ollama } from './ollama';
import { OpenAiCompatible } from './openai-compatible';
import type { Provider } from './provider';

const customProviderFactories: Record<
	CustomProviderType,
	(record: CustomProviderRecord) => Provider
> = {
	openai: (record) => new OpenAiCompatible(record)
};

export function listBuiltInProviders(): Provider[] {
	return [new LlamaCpp(), new Ollama()];
}

export async function findProvider(id: string): Promise<Provider | null> {
	const builtIn = listBuiltInProviders().find((provider) => provider.id === id);
	if (builtIn) return builtIn;

	const record = await CustomProvidersRepository.find(id);
	return record ? customProviderFactories[record.type](record) : null;
}
