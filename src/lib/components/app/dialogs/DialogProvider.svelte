<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		CUSTOM_PROVIDER_TYPES,
		PROVIDER_NAME_MAX_LENGTH,
		type CustomProviderType
	} from '$lib/constants';
	import type { ApiCustomProviderInfo, ApiCustomProviderRequest } from '$lib/types';
	import { normalizeProviderBaseUrl } from '$lib/utils';
	import { CUSTOM_PROVIDER_TYPE_OPTIONS } from './provider-types';

	interface Props {
		onOpenChange: (open: boolean) => void;
		onSave: (type: CustomProviderType, value: ApiCustomProviderRequest) => Promise<void> | void;
		open: boolean;
		provider?: ApiCustomProviderInfo | null;
	}

	let { onOpenChange, onSave, open, provider = null }: Props = $props();

	let step = $state<'type' | 'details'>('type');
	let type = $state<CustomProviderType>(CUSTOM_PROVIDER_TYPES[0]);
	let name = $state('');
	let baseUrl = $state('');
	let apiKey = $state('');
	let removeApiKey = $state(false);
	let saving = $state(false);

	const option = $derived(CUSTOM_PROVIDER_TYPE_OPTIONS[type]);
	const resolvedBaseUrl = $derived(normalizeProviderBaseUrl(baseUrl));
	const submittable = $derived(name.trim() !== '' && resolvedBaseUrl !== null && !saving);

	$effect(() => {
		if (!open) return;
		step = provider ? 'details' : 'type';
		type = provider?.custom.type ?? CUSTOM_PROVIDER_TYPES[0];
		name = provider?.name ?? '';
		baseUrl = provider?.custom.baseUrl ?? '';
		apiKey = '';
		removeApiKey = false;
	});

	function chooseType(value: CustomProviderType): void {
		type = value;
		step = 'details';
	}

	function submittedApiKey(): string | null {
		if (removeApiKey) return '';
		const key = apiKey.trim();
		if (key || !provider) return key;
		return null;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!submittable) return;
		saving = true;
		try {
			await onSave(type, { name: name.trim(), baseUrl, apiKey: submittedApiKey() });
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		{#if step === 'type'}
			<Dialog.Header>
				<Dialog.Title>Add a provider</Dialog.Title>
				<Dialog.Description>Choose the kind of API to connect.</Dialog.Description>
			</Dialog.Header>
			<ul class="m-0 grid list-none gap-2 p-0">
				{#each CUSTOM_PROVIDER_TYPES as value (value)}
					{@const choice = CUSTOM_PROVIDER_TYPE_OPTIONS[value]}
					<li>
						<Button
							class="h-auto w-full justify-start gap-3 p-3 text-left whitespace-normal"
							onclick={() => chooseType(value)}
							variant="outline"
						>
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background"
							>
								<choice.icon class="size-4.5 text-muted-foreground" />
							</span>
							<span class="grid min-w-0 flex-1 gap-0.5">
								<span class="text-sm font-semibold">{choice.label}</span>
								<span class="text-xs font-normal text-muted-foreground">{choice.description}</span>
							</span>
							<ChevronRight class="text-muted-foreground" />
						</Button>
					</li>
				{/each}
			</ul>
			<Dialog.Footer>
				<Button onclick={() => onOpenChange(false)} variant="outline">Cancel</Button>
			</Dialog.Footer>
		{:else}
			<form class="grid gap-4" onsubmit={submit}>
				<Dialog.Header>
					<Dialog.Title>
						{provider ? `Edit ${provider.name}` : `Add ${option.label} provider`}
					</Dialog.Title>
					<Dialog.Description>{option.description}</Dialog.Description>
				</Dialog.Header>
				<div class="grid gap-2">
					<Label for="provider-name">Name</Label>
					<Input
						autofocus
						bind:value={name}
						id="provider-name"
						maxlength={PROVIDER_NAME_MAX_LENGTH}
						placeholder="My provider"
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="provider-base-url">Base URL</Label>
					<Input
						bind:value={baseUrl}
						id="provider-base-url"
						placeholder={option.baseUrlPlaceholder}
						required
						type="url"
					/>
					<p class="m-0 text-xs break-all text-muted-foreground">
						{#if resolvedBaseUrl}
							Chat requests go to {resolvedBaseUrl}/chat/completions.
						{:else}
							Include the API version path, such as /v1.
						{/if}
					</p>
				</div>
				<div class="grid gap-2">
					<Label for="provider-api-key">API key</Label>
					<Input
						autocomplete="off"
						bind:value={apiKey}
						disabled={removeApiKey}
						id="provider-api-key"
						placeholder={provider?.custom.hasApiKey
							? 'Leave blank to keep the saved key'
							: 'Optional'}
						type="password"
					/>
					{#if provider?.custom.hasApiKey}
						<div class="flex items-center gap-2">
							<Checkbox bind:checked={removeApiKey} id="provider-remove-api-key" />
							<Label class="text-xs font-normal" for="provider-remove-api-key">
								Remove the saved key
							</Label>
						</div>
					{/if}
				</div>
				<Dialog.Footer>
					{#if provider}
						<Button onclick={() => onOpenChange(false)} variant="outline">Cancel</Button>
					{:else}
						<Button onclick={() => (step = 'type')} variant="outline"><ChevronLeft /> Back</Button>
					{/if}
					<Button disabled={!submittable} type="submit">
						{provider ? 'Save changes' : 'Add provider'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
