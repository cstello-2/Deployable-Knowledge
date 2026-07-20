import { derived, get, writable } from "svelte/store";
import { windowDefinitions, type WindowColumn } from "$lib/components/windows";

export type WindowPlacement = {
  id: string;
  column: WindowColumn;
  visible: boolean;
  collapsed: boolean;
  height: number | null;
};

type WindowDropPlacement = {
  windowId: string | null;
  columnId: string | null;
  columnIndex: number;
};

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
const WINDOW_PLACEMENTS_STORAGE_KEY = "layout:windowPlacements";
const DEFAULT_WINDOW_HEIGHT = 320;
const definitionsById = new Map(
  windowDefinitions.map((definition) => [definition.id, definition]),
);

export const windowPlacements = writable<WindowPlacement[]>(
  defaultWindowPlacements(),
);
export const visibleWindows = derived(windowPlacements, ($placements) =>
  $placements
    .filter((placement) => placement.visible)
    .map((placement) => {
      const definition = definitionsById.get(placement.id);
      return definition
        ? {
            ...definition,
            column: placement.column,
            collapsed: placement.collapsed,
            height: placement.height,
          }
        : null;
    })
    .filter((definition) => definition !== null),
);
export const leftPaneCollapsed = writable(false);
export const leftPaneWidth = writable<number | null>(null);
export const layoutPresets = writable<LayoutPreset[]>([
  createLayoutPreset("layout-default", captureWorkspaceLayout()),
]);
export const activeLayoutPresetId = writable("layout-default");

let storageInitialized = false;
let suppressPresetAutoSave = false;

export function initWorkspaceStateStorage() {
  if (storageInitialized || typeof localStorage === "undefined") return;

  windowPlacements.set(readWindowPlacements());

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
  windowPlacements.subscribe(saveWindowPlacements);
  windowPlacements.subscribe(autoSaveActiveLayoutPreset);
  leftPaneCollapsed.subscribe(autoSaveActiveLayoutPreset);
  leftPaneWidth.subscribe(autoSaveActiveLayoutPreset);
}

export function showWindow(id: string) {
  windowPlacements.update((placements) =>
    placements.map((placement) =>
      placement.id === id
        ? {
            ...placement,
            visible: true,
            collapsed: false,
            height: placement.height ?? DEFAULT_WINDOW_HEIGHT,
          }
        : placement,
    ),
  );
}

export function isWindowVisible(id: string) {
  return get(windowPlacements).some(
    (placement) => placement.id === id && placement.visible,
  );
}

export function closeWindow(id: string) {
  windowPlacements.update((placements) =>
    placements.map((placement) =>
      placement.id === id ? { ...placement, visible: false } : placement,
    ),
  );
}

export function toggleWindowCollapsed(id: string) {
  windowPlacements.update((placements) =>
    placements.map((placement) =>
      placement.id === id
        ? { ...placement, collapsed: !placement.collapsed }
        : placement,
    ),
  );
}

export function setWindowHeights(updates: { id: string; height: number }[]) {
  const heights = new Map(
    updates.map(({ id, height }) => [id, Math.max(0, Math.round(height))]),
  );

  windowPlacements.update((placements) =>
    placements.map((placement) =>
      heights.has(placement.id)
        ? {
            ...placement,
            height: heights.get(placement.id) ?? placement.height,
          }
        : placement,
    ),
  );
}

export function placeWindowFromDrop({
  windowId,
  columnId,
  columnIndex,
}: WindowDropPlacement) {
  if (!windowId || !isWindowColumn(columnId)) return;

  windowPlacements.update((placements) => {
    const moving = placements.find((placement) => placement.id === windowId);
    if (!moving) return placements;

    const nextMoving = {
      ...moving,
      column: columnId,
      visible: true,
      height: moving.height ?? DEFAULT_WINDOW_HEIGHT,
    };
    const remaining = placements.filter(
      (placement) => placement.id !== windowId,
    );
    const targetColumnWindows = remaining.filter(
      (placement) => placement.visible && placement.column === columnId,
    );
    const before = targetColumnWindows[columnIndex];

    if (before) {
      const insertAt = remaining.findIndex(
        (placement) => placement.id === before.id,
      );
      return ensureVisibleWindowHeights([
        ...remaining.slice(0, insertAt),
        nextMoving,
        ...remaining.slice(insertAt),
      ]);
    }

    const lastTarget = targetColumnWindows.at(-1);
    if (lastTarget) {
      const insertAt =
        remaining.findIndex((placement) => placement.id === lastTarget.id) + 1;
      return ensureVisibleWindowHeights([
        ...remaining.slice(0, insertAt),
        nextMoving,
        ...remaining.slice(insertAt),
      ]);
    }

    return ensureVisibleWindowHeights([...remaining, nextMoving]);
  });
}

export function toggleLeftPaneCollapsed() {
  ensureWorkspaceStateStorage();
  leftPaneCollapsed.update((collapsed) => !collapsed);
}

export function setLeftPaneWidth(width: number | null) {
  leftPaneWidth.set(
    width && Number.isFinite(width) && width > 0 ? Math.round(width) : null,
  );
}

export function applyLayoutPreset(id: string) {
  ensureWorkspaceStateStorage();

  const preset = get(layoutPresets).find((candidate) => candidate.id === id);
  if (!preset) return;

  restoreLayoutSnapshot(id, preset.snapshot);
}

export function deleteActiveLayoutPreset() {
  ensureWorkspaceStateStorage();

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
  ensureWorkspaceStateStorage();

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
    windowPlacements.set(
      normalizeWindowPlacements(nextSnapshot.windowPlacements),
    );
  } finally {
    suppressPresetAutoSave = wasSuppressing;
  }
}

function defaultWindowPlacements(): WindowPlacement[] {
  return windowDefinitions.map((definition) => ({
    id: definition.id,
    column: definition.column,
    visible: definition.defaultVisible ?? true,
    collapsed: false,
    height: DEFAULT_WINDOW_HEIGHT,
  }));
}

function readWindowPlacements() {
  const stored = localStorage.getItem(WINDOW_PLACEMENTS_STORAGE_KEY);
  if (!stored) return defaultWindowPlacements();

  return normalizeWindowPlacements(JSON.parse(stored));
}

function saveWindowPlacements(placements: WindowPlacement[]) {
  localStorage.setItem(
    WINDOW_PLACEMENTS_STORAGE_KEY,
    JSON.stringify(placements),
  );
}

function normalizeWindowPlacements(value: unknown) {
  const fallback = defaultWindowPlacements();
  if (!Array.isArray(value)) return fallback;

  const fallbackById = new Map(
    fallback.map((placement) => [placement.id, placement]),
  );
  const seen = new Set<string>();
  const next: WindowPlacement[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) {
      continue;
    }

    const defaultPlacement = fallbackById.get(item.id);
    if (!defaultPlacement) continue;

    next.push({
      id: defaultPlacement.id,
      column: isWindowColumn(item.column)
        ? item.column
        : defaultPlacement.column,
      visible:
        typeof item.visible === "boolean"
          ? item.visible
          : defaultPlacement.visible,
      collapsed:
        typeof item.collapsed === "boolean"
          ? item.collapsed
          : defaultPlacement.collapsed,
      height: parseWindowHeight(item.height) ?? defaultPlacement.height,
    });
    seen.add(item.id);
  }

  return [...next, ...fallback.filter((placement) => !seen.has(placement.id))];
}

function parseWindowHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

function ensureVisibleWindowHeights(placements: WindowPlacement[]) {
  return placements.map((placement) =>
    placement.visible && placement.height === null
      ? { ...placement, height: DEFAULT_WINDOW_HEIGHT }
      : placement,
  );
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

function ensureWorkspaceStateStorage() {
  if (!storageInitialized) initWorkspaceStateStorage();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWindowColumn(value: unknown): value is WindowColumn {
  return value === "left" || value === "right";
}
