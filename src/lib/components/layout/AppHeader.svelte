<script lang="ts">
  import { getContext, onMount } from "svelte";
  import Dropdown from "$lib/components/menus/Dropdown.svelte";
  import EngineHeartbeat from "$lib/components/layout/EngineHeartbeat.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import ThemePopup from "$lib/components/popups/ThemePopup.svelte";
  import favicon from "$lib/assets/icon.svg";

  import { applyThemeSettings, readThemeSettings } from "$lib/utils/theme";
  import { showWindow, windowPlacements } from "$lib/utils/workspaceState";
  import { windowDefinitions } from "$lib/components/windows";
  import type { AppState } from "$lib/state.svelte";

  const appState = getContext<AppState>("appState");
  let menuOpen = $state(false);
  let toolsOpen = $state(false);
  let userOpen = $state(false);
  let themePopupOpen = $state(false);

  onMount(() => {
    applyThemeSettings(readThemeSettings());
  });

  function openThemePopup() {
    menuOpen = false;
    toolsOpen = false;
    userOpen = false;
    themePopupOpen = true;
  }

  function restoreWindow(id: string) {
    if (id === "graph-galaxy-window" && appState.retrievalMode !== "graph") {
      return;
    }
    showWindow(id);
    toolsOpen = false;
    menuOpen = false;
    userOpen = false;
  }

  function isWindowVisible(id: string) {
    return (
      $windowPlacements.find((placement) => placement.id === id)?.visible ??
      false
    );
  }

  function windowUnavailable(id: string) {
    return id === "graph-galaxy-window" && appState.retrievalMode !== "graph";
  }

  async function createNewChat() {
    menuOpen = false;
    toolsOpen = false;
    userOpen = false;
  }

  function toggleMainMenu() {
    menuOpen = !menuOpen;
    toolsOpen = false;
    userOpen = false;
  }

  function toggleToolsMenu() {
    toolsOpen = !toolsOpen;
    menuOpen = false;
    userOpen = false;
  }

  function toggleUserMenu() {
    userOpen = !userOpen;
    menuOpen = false;
    toolsOpen = false;
  }
</script>

<header class="app-header">
  <div class="left">
    <Dropdown id="main_menu" bind:open={menuOpen} minWidth="220px">
      {#snippet trigger({ open, menuId })}
        <button
          class="menu-trigger"
          type="button"
          aria-haspopup="true"
          aria-controls={menuId}
          aria-expanded={open}
          onclick={toggleMainMenu}
        >
          Menu
          <Icon name="expand_more" size={16} />
        </button>
      {/snippet}

      <button
        class="menu-item"
        type="button"
        role="menuitem"
        onclick={createNewChat}>New Chat</button
      >
      <button
        class="menu-item"
        type="button"
        role="menuitem"
        onclick={openThemePopup}>Theme</button
      >
    </Dropdown>

    <Dropdown id="tools_menu" bind:open={toolsOpen} minWidth="220px">
      {#snippet trigger({ open, menuId })}
        <button
          class="menu-trigger"
          type="button"
          aria-haspopup="true"
          aria-controls={menuId}
          aria-expanded={open}
          onclick={toggleToolsMenu}
        >
          Tools
          <Icon name="expand_more" size={16} />
        </button>
      {/snippet}

      {#each windowDefinitions as window (window.id)}
        <button
          class="menu-item"
          class:visible={isWindowVisible(window.id)}
          type="button"
          role="menuitem"
          disabled={windowUnavailable(window.id)}
          title={windowUnavailable(window.id)
            ? "Enable KG search in Settings to use Graph Galaxy"
            : window.title}
          onclick={() => restoreWindow(window.id)}
        >
          <span>{window.title}</span>
          {#if windowUnavailable(window.id)}
            <span class="menu-item-hint">KG only</span>
          {/if}
        </button>
      {/each}
    </Dropdown>
  </div>

  <div class="brand">
    <img src={favicon} alt="" aria-hidden="true" />
    <strong>Deployable Knowledge vA0.3.0</strong>
  </div>

  <div class="right">
    <EngineHeartbeat />
    <Dropdown
      id="user_menu"
      bind:open={userOpen}
      align="end"
      minWidth="220px"
    >
      {#snippet trigger({ open, menuId })}
        <button
          class="menu-trigger"
          type="button"
          aria-haspopup="true"
          aria-controls={menuId}
          aria-expanded={open}
          onclick={toggleUserMenu}
        >
          local-user
          <Icon name="expand_more" size={16} />
        </button>
      {/snippet}

      <button class="menu-item" type="button" role="menuitem" disabled={true}
        >Logout</button
      >
    </Dropdown>
  </div>
</header>

<ThemePopup open={themePopupOpen} onClose={() => (themePopupOpen = false)} />

<style>
  .app-header {
    position: relative;
    display: flex;
    height: 40px;
    padding: 0px 6px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%)),
      hsl(var(--h) var(--sat) var(--l-panel))
    );
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .right {
    margin-left: auto;
  }

  .brand {
    position: absolute;
    left: 50%;
    display: flex;
    max-width: min(44vw, 420px);
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 14px;
    letter-spacing: 0.3px;
    align-items: center;
    gap: 8px;
    transform: translateX(-50%);
  }

  .brand img {
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
  }

  .brand strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    font-size: 12px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .menu-trigger:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
  }

  .menu-item {
    display: grid;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .menu-item.visible {
    color: var(--muted);
  }

  .menu-item:hover:not(:disabled) {
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .menu-item-hint {
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
  }

  @media (max-width: 760px) {
    .app-header {
      height: auto;
      align-items: stretch;
      flex-wrap: wrap;
    }

    .brand {
      position: static;
      order: -1;
      width: 100%;
      max-width: none;
      justify-content: center;
      transform: none;
    }

    .right {
      margin-left: 0;
    }
  }
</style>
