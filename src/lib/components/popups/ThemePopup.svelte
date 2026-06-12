<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";
  import {
    readThemeSettings,
    saveThemeSettings,
    themeColors,
    themeModes,
    type ThemeColor,
    type ThemeMode,
  } from "$lib/utils/theme";

  type Props = {
    open: boolean;
    onClose: () => void;
  };

  let { open, onClose }: Props = $props();
  let settings = $state(readThemeSettings());

  $effect(() => {
    if (open) settings = readThemeSettings();
  });

  function setMode(mode: ThemeMode) {
    settings = { ...settings, mode };
    saveThemeSettings(settings);
  }

  function setColor(color: ThemeColor) {
    settings = { ...settings, color };
    saveThemeSettings(settings);
  }
</script>

<Popup
  {open}
  title="Theme Settings"
  id="theme-settings"
  contentLabel="Theme settings"
  {onClose}
>
  <div class="theme-form">
    <div class="current">Current Theme: {settings.mode} {settings.color}</div>

    <label>
      <span>Mode</span>
      <select
        value={settings.mode}
        onchange={(event) => setMode(event.currentTarget.value as ThemeMode)}
      >
        {#each themeModes as mode}
          <option value={mode}>{mode}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Color Option</span>
      <select
        value={settings.color}
        onchange={(event) => setColor(event.currentTarget.value as ThemeColor)}
      >
        {#each themeColors as color}
          <option value={color}>{color}</option>
        {/each}
      </select>
    </label>

    <div class="actions">
      <button type="button" onclick={onClose}>Save</button>
    </div>
  </div>
</Popup>

<style>
  .theme-form {
    display: grid;
    gap: 14px;
  }

  .current {
    color: var(--muted);
    font-size: 12px;
  }

  label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  select {
    width: 100%;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    padding: 0 10px;
  }

  select:hover,
  select:focus {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    outline: none;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  button {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    cursor: pointer;
    padding: 6px 12px;
  }

  button:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
  }
</style>
