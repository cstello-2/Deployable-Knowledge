import { json, type RequestHandler } from "@sveltejs/kit";
import {
  deleteAssistantProfile,
  deletePersona,
  deletePromptTemplate,
  loadAssistantState,
  saveAssistantProfile,
  saveAssistantSettings,
  savePersona,
  savePromptTemplate,
} from "$lib/server/assistant/assistantStateService";

export const GET: RequestHandler = async () => {
  return json(await loadAssistantState());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "settings.save") {
      return json(await saveAssistantSettings(body.settings));
    }

    if (action === "template.save") {
      return json(await savePromptTemplate(body.template));
    }

    if (action === "template.delete") {
      return json(await deletePromptTemplate(body.id));
    }

    if (action === "persona.save") {
      return json(await savePersona(body.persona));
    }

    if (action === "persona.delete") {
      return json(await deletePersona(body.id));
    }

    if (action === "profile.save") {
      return json(await saveAssistantProfile(body.profile));
    }

    if (action === "profile.delete") {
      return json(await deleteAssistantProfile(body.id));
    }

    return json(
      { error: `Unknown assistant-state action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
};