import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createSession } from "$lib/server/auth/utils";

export const GET: RequestHandler = async ({ cookies }) => {
  // In the future we would take username and password from the body
  // const body = await request.json();

  // For now we just give session tokens to our `local_user` which doesn't actually exist
  let session = await createSession("local_user");

  cookies.delete("session_token", { path: "/" });

  cookies.set("session_token", session.token!, {
    httpOnly: true,
    secure: true,
    path: "/",
  });

  throw redirect(303, "/");
};
