<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { settingsStore } from '$lib/stores';

	const selectedValue = $derived(`${settingsStore.config.provider}::${settingsStore.config.model}`);

	function selectModel(value: string): void {
		const separator = value.indexOf('::');
		if (separator < 0) return;
		settingsStore.updateConfig({
			provider: value.slice(0, separator),
			model: value.slice(separator + 2)
		});
	}
</script>

<section class="grid gap-2">
	<div class="flex items-center justify-between gap-2">
		<Label for="settings-model">Provider and model</Label>
		<Button variant="ghost" size="sm" href={resolve('/settings/models')}>
			<KeyRound /> API keys
		</Button>
	</div>
	<Select.Root type="single" value={selectedValue} onValueChange={selectModel}>
		<Select.Trigger id="settings-model" class="w-full">
			<span class="truncate">{settingsStore.config.model || 'Select a model'}</span>
		</Select.Trigger>
		<Select.Content>
			{#each settingsStore.providerModelGroups as provider (provider.id)}
				<Select.Group>
					<Select.GroupHeading>{provider.name}</Select.GroupHeading>
					{#each provider.models as model (model)}
						<Select.Item value={`${provider.id}::${model}`} label={model} />
					{/each}
				</Select.Group>
			{/each}
		</Select.Content>
	</Select.Root>
</section>
