export type NotebookPage = {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type Notebook = {
  id: string;
  userId: string;
  title: string;
  activePageId: string | null;
  createdAt: string;
  updatedAt: string;
  pages: NotebookPage[];
};

export type NotebookState = {
  activeNotebookId: string | null;
  notebooks: Notebook[];
};

export type NotebookAction =
  | { action: "notebook.create"; title?: string }
  | { action: "notebook.select"; notebookId: string }
  | { action: "notebook.rename"; notebookId: string; title: string }
  | { action: "notebook.delete"; notebookId: string }
  | { action: "page.create"; notebookId: string; title?: string }
  | { action: "page.select"; notebookId: string; pageId: string }
  | { action: "page.rename"; pageId: string; title: string }
  | { action: "page.update"; pageId: string; content: string }
  | { action: "page.delete"; notebookId: string; pageId: string };

export async function notebookRequest(
  body?: NotebookAction,
): Promise<NotebookState> {
  const response = await fetch("/notebooks", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Notebook request failed: ${response.status}`);
  }

  return (await response.json()) as NotebookState;
}
