import { get, writable } from "svelte/store";
import {
  normalizeWindowPlacements,
  restoreWindowPlacements,
  windowPlacements,
  type WindowPlacement,
} from "./windowState";

export type WorkspaceLayoutSnapshot = {
  windowPlacements: WindowPlacement[];
  leftWidth: number | null;
  leftPaneCollapsed: boolean;
};

export type LayoutPreset = {
  id: string;
  snapshot: WorkspaceLayoutSnapshot;
};

type StoredLayoutPresetState = {
  activePresetId: string;
  presets: LayoutPreset[];
};

const LAYOUT_PRESET_STATE_STORAGE_KEY = "layout:presetState";
const LEGACY_LAYOUT_PRESETS_STORAGE_KEY = "layout:presets";
const LEGACY_ACTIVE_LAYOUT_PRESET_STORAGE_KEY = "layout:activePreset";

export const leftPaneCollapsed = writable(false);
export const leftPaneWidth = writable<number | null>(null);
export const layoutPresets = writable<LayoutPreset[]>([
  createLayoutPreset("layout-default", captureWorkspaceLayout()),
]);
export const activeLayoutPresetId = writable("layout-default");

let storageInitialized = false;
let suppressPresetAutoSave = false;

export function initLayoutPresetStorage() {
  if (storageInitialized || typeof localStorage === "undefined") return;

  const storedState = readLayoutPresetState();
  const presets =
    storedState && storedState.presets.length > 0
      ? storedState.presets
      : [createLayoutPreset("layout-default", captureWorkspaceLayout())];
  const activePreset =
    presets.find((preset) => preset.id === storedState?.activePresetId) ??
    presets[0];

  suppressPresetAutoSave = true;
  layoutPresets.set(presets);
  restoreLayoutSnapshot(activePreset.id, activePreset.snapshot);
  suppressPresetAutoSave = false;
  storageInitialized = true;

  layoutPresets.subscribe(saveLayoutPresetState);
  activeLayoutPresetId.subscribe(saveLayoutPresetState);
  windowPlacements.subscribe(autoSaveActiveLayoutPreset);
  leftPaneCollapsed.subscribe(autoSaveActiveLayoutPreset);
  leftPaneWidth.subscribe(autoSaveActiveLayoutPreset);
}

export function toggleLeftPaneCollapsed() {
  ensureLayoutPresetStorage();
  leftPaneCollapsed.update((collapsed) => !collapsed);
}

export function setLeftPaneWidth(width: number | null) {
  leftPaneWidth.set(width && Number.isFinite(width) && width > 0 ? Math.round(width) : null);
}

export function applyLayoutPreset(id: string) {
  ensureLayoutPresetStorage();

  const preset = get(layoutPresets).find((candidate) => candidate.id === id);
  if (!preset) return;

  restoreLayoutSnapshot(id, preset.snapshot);
}

export function deleteActiveLayoutPreset() {
  ensureLayoutPresetStorage();

  const activeId = get(activeLayoutPresetId);
  const presets = get(layoutPresets);
  if (presets.length <= 1) return;

  const activeIndex = Math.max(
    0,
    presets.findIndex((preset) => preset.id === activeId),
  );
  const nextPresets = presets.filter((preset) => preset.id !== activeId);
  const nextPreset =
    nextPresets[Math.min(activeIndex, nextPresets.length - 1)] ??
    nextPresets[0];

  if (!nextPreset) return;

  suppressPresetAutoSave = true;
  layoutPresets.set(nextPresets);
  restoreLayoutSnapshot(nextPreset.id, nextPreset.snapshot);
  suppressPresetAutoSave = false;
  saveLayoutPresetState();
}

export function addLayoutPreset() {
  ensureLayoutPresetStorage();

  const preset = createLayoutPreset(createPresetId(), captureWorkspaceLayout());

  layoutPresets.set([...get(layoutPresets), preset]);
  activeLayoutPresetId.set(preset.id);
}

function captureWorkspaceLayout(): WorkspaceLayoutSnapshot {
  return {
    windowPlacements: cloneWindowPlacements(
      normalizeWindowPlacements(get(windowPlacements)),
    ),
    leftWidth: get(leftPaneWidth),
    leftPaneCollapsed: get(leftPaneCollapsed),
  };
}

function autoSaveActiveLayoutPreset() {
  if (!storageInitialized || suppressPresetAutoSave) return;

  saveLayoutPresetSnapshot(get(activeLayoutPresetId), captureWorkspaceLayout());
}

function createLayoutPreset(
  id: string,
  snapshot: WorkspaceLayoutSnapshot,
): LayoutPreset {
  return {
    id,
    snapshot: cloneSnapshot(snapshot),
  };
}

function saveLayoutPresetSnapshot(
  id: string,
  snapshot: WorkspaceLayoutSnapshot,
) {
  layoutPresets.update((presets) =>
    presets.map((preset) =>
      preset.id === id
        ? {
            ...preset,
            snapshot: cloneSnapshot(snapshot),
          }
        : preset,
    ),
  );
}

function restoreLayoutSnapshot(id: string, snapshot: WorkspaceLayoutSnapshot) {
  const wasSuppressing = suppressPresetAutoSave;
  const nextSnapshot = cloneSnapshot(snapshot);

  suppressPresetAutoSave = true;
  try {
    activeLayoutPresetId.set(id);
    leftPaneWidth.set(nextSnapshot.leftWidth);
    leftPaneCollapsed.set(nextSnapshot.leftPaneCollapsed);
    restoreWindowPlacements(nextSnapshot.windowPlacements);
  } finally {
    suppressPresetAutoSave = wasSuppressing;
  }
}

function saveLayoutPresetState() {
  if (!storageInitialized || typeof localStorage === "undefined") return;

  localStorage.setItem(
    LAYOUT_PRESET_STATE_STORAGE_KEY,
    JSON.stringify({
      activePresetId: get(activeLayoutPresetId),
      presets: get(layoutPresets),
    } satisfies StoredLayoutPresetState),
  );
}

function readLayoutPresetState(): StoredLayoutPresetState | null {
  const storedState = readStoredState(LAYOUT_PRESET_STATE_STORAGE_KEY);
  if (storedState) return storedState;

  const legacyPresets = readStoredPresets(LEGACY_LAYOUT_PRESETS_STORAGE_KEY);
  if (legacyPresets.length === 0) return null;

  return {
    activePresetId:
      localStorage.getItem(LEGACY_ACTIVE_LAYOUT_PRESET_STORAGE_KEY) ??
      legacyPresets[0].id,
    presets: legacyPresets,
  };
}

function readStoredState(key: string): StoredLayoutPresetState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!isRecord(parsed)) return null;

    const presets = readPresetsValue(parsed.presets);
    if (presets.length === 0 || typeof parsed.activePresetId !== "string") {
      return null;
    }

    return {
      activePresetId: parsed.activePresetId,
      presets,
    };
  } catch {
    return null;
  }
}

function readStoredPresets(key: string) {
  try {
    return readPresetsValue(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

function readPresetsValue(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const presets: LayoutPreset[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) {
      continue;
    }

    const snapshot = readSnapshotValue(item.snapshot);
    if (!snapshot) continue;

    presets.push({ id: item.id, snapshot });
    seen.add(item.id);
  }

  return presets;
}

function readSnapshotValue(value: unknown): WorkspaceLayoutSnapshot | null {
  if (!isRecord(value)) return null;

  const leftWidth =
    typeof value.leftWidth === "number" &&
    Number.isFinite(value.leftWidth) &&
    value.leftWidth > 0
      ? Math.round(value.leftWidth)
      : null;

  return {
    windowPlacements: cloneWindowPlacements(
      normalizeWindowPlacements(value.windowPlacements),
    ),
    leftWidth,
    leftPaneCollapsed:
      typeof value.leftPaneCollapsed === "boolean"
        ? value.leftPaneCollapsed
        : false,
  };
}

function cloneSnapshot(
  snapshot: WorkspaceLayoutSnapshot,
): WorkspaceLayoutSnapshot {
  return {
    windowPlacements: cloneWindowPlacements(snapshot.windowPlacements),
    leftWidth: snapshot.leftWidth,
    leftPaneCollapsed: snapshot.leftPaneCollapsed,
  };
}

function cloneWindowPlacements(placements: WindowPlacement[]) {
  return placements.map((placement) => ({ ...placement }));
}

function createPresetId() {
  return globalThis.crypto?.randomUUID
    ? `layout-${globalThis.crypto.randomUUID()}`
    : `layout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureLayoutPresetStorage() {
  if (!storageInitialized) initLayoutPresetStorage();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
