<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { settingsStore } from '$lib/stores';
</script>

<section class="grid gap-2">
	<Label for="settings-persona">Assistant persona</Label>
	<Textarea
		id="settings-persona"
		class="min-h-24"
		placeholder="Optional style, role, or response guidance"
		value={settingsStore.config.persona}
		oninput={(event) => settingsStore.updateConfig({ persona: event.currentTarget.value })}
	/>
</section>
