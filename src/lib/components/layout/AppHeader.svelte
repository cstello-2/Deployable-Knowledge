<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import ThemePopup from "$lib/components/popups/ThemePopup.svelte";
  // import {
  //   currentUser,
  //   initializeSessionState,
  //   logout,
  //   startNewSession,
  // } from "$lib/client/sessionState";
  import { applyThemeSettings, readThemeSettings } from "$lib/utils/theme";
  import { showWindow, windowPlacements } from "$lib/utils/workspaceState";
  import { windowDefinitions } from "$lib/components/windows";

  let menuOpen = $state(false);
  let toolsOpen = $state(false);
  let userOpen = $state(false);
  let themePopupOpen = $state(false);

  onMount(() => {
    applyThemeSettings(readThemeSettings());
    // initializeSessionState().catch((error) => {
    //   console.error("Session initialization failed", error);
    // });
  });

  function openThemePopup() {
    menuOpen = false;
    toolsOpen = false;
    userOpen = false;
    themePopupOpen = true;
  }

  function restoreWindow(id: string) {
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

  async function createNewChat() {
    // await startNewSession();
    menuOpen = false;
    toolsOpen = false;
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
    <div class="menu">
      <button
        class="menu-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onclick={() => {
          menuOpen = !menuOpen;
          toolsOpen = false;
          userOpen = false;
        }}
      >
        Menu
        <Icon name="expand_more" size={16} />
      </button>

      {#if menuOpen}
        <div class="menu-dropdown" role="menu">
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
        </div>
      {/if}
    </div>

    <div class="menu">
      <button
        class="menu-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={toolsOpen}
        onclick={() => {
          toolsOpen = !toolsOpen;
          menuOpen = false;
          userOpen = false;
        }}
      >
        Tools
        <Icon name="expand_more" size={16} />
      </button>

      {#if toolsOpen}
        <div class="menu-dropdown" role="menu">
          {#each windowDefinitions as window (window.id)}
            <button
              class="menu-item"
              class:visible={isWindowVisible(window.id)}
              type="button"
              role="menuitem"
              onclick={() => restoreWindow(window.id)}
            >
              <span>{window.title}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="brand">
    <strong>Deployable Knowledge vA0.3.0</strong>
  </div>

  <div class="right">
    <div class="menu">
      <button
        class="menu-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={userOpen}
        onclick={toggleUserMenu}
      >
        <!-- {$currentUser?.user || "User"} -->
        User
        <Icon name="expand_more" size={16} />
      </button>
      {#if userOpen}
        <div class="menu-dropdown user-dropdown" role="menu">
          <!-- <button -->
          <!--   class="menu-item" -->
          <!--   type="button" -->
          <!--   role="menuitem" -->
          <!--   onclick={logout}>Reset Local Session</button -->
          <!-- > -->
        </div>
      {/if}
    </div>
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
    max-width: min(44vw, 420px);
    overflow: hidden;
    color: var(--muted);
    font-size: 14px;
    letter-spacing: 0.3px;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .menu {
    position: relative;
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
  }

  .menu-trigger {
    padding: 6px 10px;
    cursor: pointer;
  }

  .menu-trigger:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
  }

  .menu-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;
    min-width: 220px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) - 1%));
    box-shadow: var(--shadow);
  }

  .user-dropdown {
    right: 0;
    left: auto;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .menu-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .menu-item.visible {
    color: var(--muted);
  }

  .menu-item:hover {
    background: hsl(var(--h) var(--sat) var(--l-panel));
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
      text-align: center;
      transform: none;
    }

    .right {
      margin-left: 0;
    }
  }
</style>
