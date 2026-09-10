export const CUSTOM_PROVIDER_TYPES = ['openai'] as const;

export type CustomProviderType = (typeof CUSTOM_PROVIDER_TYPES)[number];

export const PROVIDER_NAME_MAX_LENGTH = 80;
