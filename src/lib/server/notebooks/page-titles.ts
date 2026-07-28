export function uniqueNotebookPageTitle(
  requestedTitle: string,
  existingTitles: readonly string[],
): string {
  const baseTitle = requestedTitle.trim() || "Untitled Page";
  const normalizedExisting = new Set(
    existingTitles.map((title) => title.trim().toLocaleLowerCase()),
  );

  if (!normalizedExisting.has(baseTitle.toLocaleLowerCase())) {
    return baseTitle;
  }

  let suffix = 2;
  while (
    normalizedExisting.has(`${baseTitle} (${suffix})`.toLocaleLowerCase())
  ) {
    suffix += 1;
  }

  return `${baseTitle} (${suffix})`;
}
