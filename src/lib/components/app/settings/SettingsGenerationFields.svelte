<script lang="ts">
	import { AGENT_MAX_TURNS_MAX, AGENT_MAX_TURNS_MIN } from '$lib/constants';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { settingsStore } from '$lib/stores';

	function numberValue(event: Event, fallback: number): number {
		const value =
			event.currentTarget instanceof HTMLInputElement
				? event.currentTarget.valueAsNumber
				: Number.NaN;
		return Number.isFinite(value) ? value : fallback;
	}
</script>

<section class="grid gap-3 sm:grid-cols-2">
	<div class="grid gap-2">
		<Label for="settings-max-tokens">Max output tokens</Label>
		<Input
			id="settings-max-tokens"
			type="number"
			min="1"
			value={settingsStore.config.maxTokens}
			oninput={(event) =>
				settingsStore.updateConfig({
					maxTokens: Math.max(1, Math.floor(numberValue(event, settingsStore.config.maxTokens)))
				})}
		/>
	</div>
	<div class="grid gap-2">
		<Label for="settings-temperature">Temperature</Label>
		<Input
			id="settings-temperature"
			type="number"
			min="0"
			max="2"
			step="0.05"
			value={settingsStore.config.temperature}
			oninput={(event) =>
				settingsStore.updateConfig({
					temperature: Math.min(
						2,
						Math.max(0, numberValue(event, settingsStore.config.temperature))
					)
				})}
		/>
	</div>
	<div class="grid gap-2">
		<Label for="settings-top-k">Sampling top K</Label>
		<Input
			id="settings-top-k"
			type="number"
			min="1"
			value={settingsStore.config.topK}
			oninput={(event) =>
				settingsStore.updateConfig({
					topK: Math.max(1, Math.floor(numberValue(event, settingsStore.config.topK)))
				})}
		/>
	</div>
	<div class="grid gap-2">
		<Label for="settings-agent-turns">Agent turns</Label>
		<Input
			id="settings-agent-turns"
			type="number"
			min={AGENT_MAX_TURNS_MIN}
			max={AGENT_MAX_TURNS_MAX}
			value={settingsStore.config.agentMaxTurns}
			oninput={(event) =>
				settingsStore.updateConfig({
					agentMaxTurns: Math.min(
						AGENT_MAX_TURNS_MAX,
						Math.max(
							AGENT_MAX_TURNS_MIN,
							Math.floor(numberValue(event, settingsStore.config.agentMaxTurns))
						)
					)
				})}
		/>
	</div>
</section>
