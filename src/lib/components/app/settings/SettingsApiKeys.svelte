<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { DialogApiKeys } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import { settingsStore } from '$lib/stores';

	let open = $state(false);
</script>

<section class="grid gap-5" aria-labelledby="api-keys-heading">
	<header class="flex items-center gap-3">
		<KeyRound class="size-5 shrink-0" />
		<div class="grid gap-1">
			<h2 id="api-keys-heading" class="text-base font-semibold">API keys</h2>
			<p class="m-0 text-xs text-muted-foreground">
				Store keys for hosted providers to unlock their models in the agent model picker.
			</p>
		</div>
	</header>

	<Button class="w-fit" variant="outline" onclick={() => (open = true)}>Manage API keys</Button>
</section>

<DialogApiKeys
	{open}
	onOpenChange={(value) => (open = value)}
	onChanged={() => settingsStore.loadProviders()}
/>
