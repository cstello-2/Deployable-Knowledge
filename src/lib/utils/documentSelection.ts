import { get, writable } from "svelte/store";

export const selectedDocumentIds = writable<string[]>([]);

export function selectDocument(id: string) {
  selectedDocumentIds.update((ids) => ids.includes(id) ? ids : [...ids, id]);
}

export function toggleDocumentSelection(id: string) {
  selectedDocumentIds.update((ids) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
  );
}

export function keepExistingDocumentSelections(validIds: Set<string>) {
  selectedDocumentIds.update((ids) => ids.filter((id) => validIds.has(id)));
}

export function getSelectedDocumentIds() {
  return get(selectedDocumentIds);
}
