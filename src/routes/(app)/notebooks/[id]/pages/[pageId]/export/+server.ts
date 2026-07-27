import { error, type RequestHandler } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages, notebooks } from "$lib/server/database/schema";
import {
  notebookPageExportFilename,
  notebookPageMarkdown,
  notebookPagePdf,
} from "$lib/server/notebooks/page-export";

export const GET: RequestHandler = async ({ params, url }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  const format = url.searchParams.get("format");

  if (!notebookId || !pageId) error(400, "Missing notebook or page id");
  if (format !== "markdown" && format !== "pdf") {
    error(400, "Export format must be markdown or pdf");
  }

  const [page] = await db
    .select({
      notebookTitle: notebooks.title,
      pageTitle: notebook_pages.title,
      content: notebook_pages.content,
    })
    .from(notebook_pages)
    .innerJoin(notebooks, eq(notebooks.id, notebook_pages.notebookId))
    .where(
      and(
        eq(notebook_pages.id, pageId),
        eq(notebook_pages.notebookId, notebookId),
      ),
    )
    .limit(1);

  if (!page) error(404, "Notebook page not found");

  if (format === "markdown") {
    const filename = notebookPageExportFilename(page.pageTitle, "md");
    return new Response(notebookPageMarkdown(page), {
      headers: downloadHeaders("text/markdown; charset=utf-8", filename),
    });
  }

  const filename = notebookPageExportFilename(page.pageTitle, "pdf");
  const pdf = await notebookPagePdf(page);
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
