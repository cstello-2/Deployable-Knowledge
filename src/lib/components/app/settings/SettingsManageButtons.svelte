<script lang="ts">
	import Save from '@lucide/svelte/icons/save';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { settingsStore } from '$lib/stores';

	async function save(): Promise<void> {
		try {
			await settingsStore.saveActive();
			toast.success('Assistant settings saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Settings save failed');
		}
	}
</script>

<div class="flex flex-wrap gap-2 border-t pt-4">
	<Button disabled={!settingsStore.activeProfileId} onclick={save}><Save /> Save settings</Button>
</div>
