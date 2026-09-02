// Outcome recorded for every walked path in a synced folder. `synced` is the only
// state a reconcile keeps comparing against disk; the rest are terminal until the
// file changes on disk or the folder is retried.
export const SYNCED_FILE_STATES = ['synced', 'ignored', 'duplicate', 'malformed'] as const;
