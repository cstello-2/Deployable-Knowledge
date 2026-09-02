<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { DialogApiKeys } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import { settingsStore } from '$lib/stores';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';

	let open = $state(false);
</script>

<SettingsFieldGroup
	icon={KeyRound}
	title="API keys"
	hint="Store keys for hosted providers to unlock their models in the agent model picker."
>
	<Button class="w-fit" variant="outline" onclick={() => (open = true)}>Manage API keys</Button>
</SettingsFieldGroup>

<DialogApiKeys
	{open}
	onOpenChange={(value) => (open = value)}
	onChanged={() => settingsStore.loadProviders()}
/>
