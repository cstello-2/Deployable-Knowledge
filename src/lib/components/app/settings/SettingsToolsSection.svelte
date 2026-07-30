<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { settingsStore } from '$lib/stores';

	function toggleTool(id: string, enabled: boolean): void {
		const current = settingsStore.config.enabledTools;
		const next = enabled ? [...current, id] : current.filter((tool) => tool !== id);
		settingsStore.updateConfig({
			enabledTools: settingsStore.availableTools.map(({ id }) => id).filter((x) => next.includes(x))
		});
	}
</script>

<section class="grid gap-2.5">
	{#each settingsStore.availableTools as tool (tool.id)}
		<div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
			<Checkbox
				checked={settingsStore.config.enabledTools.includes(tool.id)}
				id={`settings-tool-${tool.id}`}
				onCheckedChange={(checked) => toggleTool(tool.id, checked === true)}
			/>
			<div class="grid gap-0.5">
				<Label for={`settings-tool-${tool.id}`} class="text-sm font-medium">{tool.label}</Label>
				<p class="m-0 text-xs text-muted-foreground">{tool.description}</p>
			</div>
		</div>
	{/each}
</section>
