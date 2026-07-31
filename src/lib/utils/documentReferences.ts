export function documentPdfPageUrl(
  documentId: string,
  pageIndex: number,
): string {
  const page = Math.max(1, Math.floor(pageIndex) + 1);
  return `/document-files/${encodeURIComponent(documentId)}#page=${page}`;
}
