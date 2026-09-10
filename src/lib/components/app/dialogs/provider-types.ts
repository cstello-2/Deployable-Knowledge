import Server from '@lucide/svelte/icons/server';
import type { Component } from 'svelte';
import type { CustomProviderType } from '$lib/constants';

export interface CustomProviderTypeOption {
	baseUrlPlaceholder: string;
	description: string;
	icon: Component;
	label: string;
}

export const CUSTOM_PROVIDER_TYPE_OPTIONS: Record<CustomProviderType, CustomProviderTypeOption> = {
	openai: {
		baseUrlPlaceholder: 'https://api.openai.com/v1',
		description:
			'Any server that implements the Chat Completions API, such as OpenAI, OpenRouter, LM Studio, vLLM, or llama.cpp server.',
		icon: Server,
		label: 'OpenAI-compatible'
	}
};
