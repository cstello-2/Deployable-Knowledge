export type ThemeMode = "Light" | "Dark";
export type ThemeColor =
  | "Classic"
  | "Purple"
  | "Blue"
  | "Yellow"
  | "Green"
  | "High Contrast";

export const themeModes: ThemeMode[] = ["Light", "Dark"];
export const themeColors: ThemeColor[] = [
  "Classic",
  "Purple",
  "Blue",
  "Yellow",
  "Green",
  "High Contrast",
];

export type ThemeSettings = {
  mode: ThemeMode;
  color: ThemeColor;
};

const defaultTheme: ThemeSettings = {
  mode: "Light",
  color: "Classic",
};

export function readThemeSettings(): ThemeSettings {
  if (typeof localStorage === "undefined") return defaultTheme;

  const mode = parseMode(localStorage.getItem("theme_mode"));
  const color = parseColor(localStorage.getItem("theme_color"));

  return { mode, color };
}

export function saveThemeSettings(settings: ThemeSettings) {
  localStorage.setItem("theme_mode", settings.mode);
  localStorage.setItem("theme_color", settings.color);
  applyThemeSettings(settings);
}

export function applyThemeSettings(settings = readThemeSettings()) {
  document.documentElement.setAttribute(
    "data-theme-mode",
    settings.mode.toLowerCase(),
  );
  document.documentElement.setAttribute(
    "data-theme-color",
    settings.color.toLowerCase(),
  );
}

function parseMode(value: string | null): ThemeMode {
  return themeModes.includes(value as ThemeMode)
    ? (value as ThemeMode)
    : defaultTheme.mode;
}

function parseColor(value: string | null): ThemeColor {
  return themeColors.includes(value as ThemeColor)
    ? (value as ThemeColor)
    : defaultTheme.color;
}
