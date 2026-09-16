<script lang="ts">
	import { untrack } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Slider } from '$lib/components/ui/slider';
	import { AGENT_MAX_TURNS_MIN, AGENT_MAX_TURNS_UNLIMITED } from '$lib/constants';
	import { settingsStore } from '$lib/stores';

	const maxTurns = Math.max(
		32,
		untrack(() => settingsStore.config.agentMaxTurns)
	);
	let turnValue = $derived(
		settingsStore.config.agentMaxTurns < 0
			? maxTurns + 1
			: Math.max(AGENT_MAX_TURNS_MIN, settingsStore.config.agentMaxTurns)
	);
	let turnLabel = $derived(turnValue > maxTurns ? 'Unlimited' : String(turnValue));

	function toggleTool(id: string, enabled: boolean): void {
		const current = settingsStore.config.enabledTools;
		const next = enabled ? [...current, id] : current.filter((tool) => tool !== id);
		settingsStore.updateConfig({
			enabledTools: settingsStore.availableTools.map(({ id }) => id).filter((x) => next.includes(x))
		});
	}
</script>

<section class="grid gap-2.5">
	<div class="mb-2 grid gap-3">
		<div class="flex items-center justify-between gap-3">
			<Label for="settings-agent-turns" id="settings-agent-turns-label">Agent turns</Label>
			<output class="text-sm font-medium tabular-nums" for="settings-agent-turns">
				{turnLabel}
			</output>
		</div>
		<Slider
			aria-describedby="settings-agent-turns-hint"
			aria-labelledby="settings-agent-turns-label"
			aria-valuetext={turnLabel}
			class="my-1"
			id="settings-agent-turns"
			max={maxTurns + 1}
			min={AGENT_MAX_TURNS_MIN}
			onValueChange={(value) => {
				const agentMaxTurns = value > maxTurns ? AGENT_MAX_TURNS_UNLIMITED : value;
				if (agentMaxTurns === settingsStore.config.agentMaxTurns) return;
				settingsStore.updateConfig({ agentMaxTurns });
			}}
			step={1}
			value={turnValue}
		/>
		<div aria-hidden="true" class="flex justify-between text-xs text-muted-foreground">
			<span>{AGENT_MAX_TURNS_MIN}</span>
			<span>Unlimited</span>
		</div>
		<p class="m-0 text-xs text-muted-foreground" id="settings-agent-turns-hint">
			Maximum rounds of tool calls before the agent answers. Move all the way right for unlimited
			turns.
		</p>
	</div>
	{#if settingsStore.modelToolSupport === 'unsupported'}
		<p class="m-0 text-xs text-muted-foreground">
			The selected model doesn't support tool calls. These tools won't run until you pick a
			tool-capable model; document chat uses automatic search instead.
		</p>
	{/if}
	{#each settingsStore.availableTools as tool (tool.id)}
		<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
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
