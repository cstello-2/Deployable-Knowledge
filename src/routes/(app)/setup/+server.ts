import { json } from "@sveltejs/kit";
import type { EmbeddingModelInstallEvent } from "$lib/requestTypes";
import {
  EMBEDDING_DTYPE,
  EMBEDDING_MODEL,
  installEmbeddingModel,
  isEmbeddingModelInstalled,
} from "$lib/server/rag/embedding-model";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  return json({
    installed: await isEmbeddingModelInstalled(),
    model: EMBEDDING_MODEL,
    dtype: EMBEDDING_DTYPE,
  });
};

export const POST: RequestHandler = async () => {
  const encoder = new TextEncoder();
  let connected = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: EmbeddingModelInstallEvent) => {
        if (!connected) return;

        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          connected = false;
        }
      };

      try {
        await installEmbeddingModel((progress) => {
          if (progress.status !== "progress_total") return;

          send({
            status: "progress",
            progress: progress.progress,
            loaded: progress.loaded,
            total: progress.total,
          });
        });
        send({ status: "ready" });
      } catch (error) {
        send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Embedding model download failed",
        });
      } finally {
        if (connected) controller.close();
      }
    },
    cancel() {
      connected = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};
