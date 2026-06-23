// Utilities for reading and writing CSS variables and applying saved themes

export function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

export function setVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

export function applyThemeSettings() {
  const mode = localStorage.getItem("theme_mode") || "Light";
  const color = localStorage.getItem("theme_color") || "Classic";

  console.log("Theme changing");

  document.documentElement.setAttribute("data-theme-mode", mode.toLowerCase());
  document.documentElement.setAttribute("data-theme-color", color.toLowerCase());
}