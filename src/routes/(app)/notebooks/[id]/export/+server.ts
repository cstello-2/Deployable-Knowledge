import { error, type RequestHandler } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages, notebooks } from "$lib/server/database/schema";
import {
  notebookMarkdown,
  notebookPageExportFilename,
  notebookPdf,
} from "$lib/server/notebooks/page-export";

type NotebookExportRequest = {
  format?: unknown;
  pageIds?: unknown;
};

export const POST: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  if (!notebookId) error(400, "Missing notebook id");

  const body = (await request.json()) as NotebookExportRequest;
  if (body.format !== "markdown" && body.format !== "pdf") {
    error(400, "Export format must be markdown or pdf");
  }
  if (
    !Array.isArray(body.pageIds) ||
    body.pageIds.length === 0 ||
    body.pageIds.some((pageId) => typeof pageId !== "string")
  ) {
    error(400, "Select at least one notebook page");
  }

  const [notebook] = await db
    .select({ title: notebooks.title })
    .from(notebooks)
    .where(eq(notebooks.id, notebookId))
    .limit(1);
  if (!notebook) error(404, "Notebook not found");

  const selectedPageIds = new Set(body.pageIds);
  const pages = (
    await db
      .select({
        id: notebook_pages.id,
        pageTitle: notebook_pages.title,
        content: notebook_pages.content,
      })
      .from(notebook_pages)
      .where(eq(notebook_pages.notebookId, notebookId))
      .orderBy(asc(notebook_pages.createdAt))
  ).filter((page) => selectedPageIds.has(page.id));

  if (pages.length === 0) error(400, "Select at least one notebook page");

  const exportData = {
    notebookTitle: notebook.title,
    pages,
  };

  if (body.format === "markdown") {
    const filename = notebookPageExportFilename(notebook.title, "md");
    return new Response(notebookMarkdown(exportData), {
      headers: downloadHeaders("text/markdown; charset=utf-8", filename),
    });
  }

  const filename = notebookPageExportFilename(notebook.title, "pdf");
  const pdf = await notebookPdf(exportData);
  return new Response(new Uint8Array(pdf), {
    headers: downloadHeaders("application/pdf", filename),
  });
};

function downloadHeaders(contentType: string, filename: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}
