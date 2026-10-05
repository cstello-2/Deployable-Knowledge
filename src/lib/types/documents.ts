export interface PendingDocument {
	key: string;
	/** Folder id or loose group the document lands in once ingested. */
	group: string;
	title: string;
}
