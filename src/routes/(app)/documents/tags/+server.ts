import { json, type RequestHandler } from "@sveltejs/kit";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  DocumentTagAssignmentRequest,
  DocumentTagRequest,
} from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { document_tags, tags } from "$lib/server/database/schema";

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

async function listTags(): Promise<string[]> {
  const rows = await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name));
  return rows.map((row) => row.name);
}

export const GET: RequestHandler = async () => {
  return json({ tags: await listTags() });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as DocumentTagRequest;
  const tag = body.tag.trim().replace(/^#/, "").toLowerCase();

  if (!TAG_PATTERN.test(tag)) {
    return json(
      { error: "Tags must start with a letter or number and use only letters, numbers, dashes, or underscores." },
      { status: 400 },
    );
  }

  await db
    .insert(tags)
    .values({ name: tag, createdAt: new Date().toISOString() })
    .onConflictDoNothing();

  return json({ tags: await listTags() }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as DocumentTagAssignmentRequest;
  const tag = body.tag.trim().replace(/^#/, "").toLowerCase();
  const documentIds = [...new Set(body.documentIds)];

  if (!TAG_PATTERN.test(tag) || documentIds.length === 0) {
    return json({ error: "A valid tag and at least one document are required." }, { status: 400 });
  }

  if (body.assigned) {
    await db
      .insert(tags)
      .values({ name: tag, createdAt: new Date().toISOString() })
      .onConflictDoNothing();
    await db
      .insert(document_tags)
      .values(documentIds.map((documentId) => ({ documentId, tag })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(document_tags)
      .where(
        and(
          inArray(document_tags.documentId, documentIds),
          eq(document_tags.tag, tag),
        ),
      );
  }

  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as DocumentTagRequest;
  const tag = body.tag.trim().replace(/^#/, "").toLowerCase();

  if (!TAG_PATTERN.test(tag)) {
    return json({ error: "A valid tag is required." }, { status: 400 });
  }

  await db.delete(document_tags).where(eq(document_tags.tag, tag));
  await db.delete(tags).where(eq(tags.name, tag));

  return json({ tags: await listTags() });
};
