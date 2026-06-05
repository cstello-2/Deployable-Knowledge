import { el } from "../ui.js";

export function render(config, winId) {
  const wrap = el("div", { class: "form assistant-settings-form" });

  const profileManageRow = el("div", { class: "row" }, [
    el("label", {}, ["Profiles"]),

    el("div", {
      class: "assistant-action-buttons",
      style: {
        display: "flex",
        gap: "6px",
        justifyContent: "flex-start",
        alignItems: "center",
        flexWrap: "wrap",
      },
    }, [
      el("button", {
        type: "button",
        class: "btn",
        id: "profile_create_btn",
        "data-profile-action": "create",
      }, ["Create Profile"]),

      el("button", {
        type: "button",
        class: "btn",
        id: "profile_load_btn",
        "data-profile-action": "load",
      }, ["Load Profile"]),

      el("button", {
        type: "button",
        class: "btn",
        id: "profile_delete_btn",
        "data-profile-action": "delete",
      }, ["Delete Profile"]),
    ]),

    // Keep this hidden select so prompt_editor.js can still use profileAction.value.
    el("select", {
      id: "profile_action",
      class: "input",
      style: { display: "none" },
    }, [
      el("option", { value: "" }, ["Manage Profiles"]),
      el("option", { value: "create" }, ["Create Profile"]),
      el("option", { value: "load" }, ["Load Profile"]),
      el("option", { value: "delete" }, ["Delete Profile"]),
    ]),
  ]);

  const profileCreateRow = el("div", {
    class: "row",
    id: "profile_create_row",
    style: { display: "none" },
  }, [
    el("label", { for: "profile_name" }, ["Profile Name"]),
    el("input", {
      id: "profile_name",
      class: "input",
      type: "text",
      placeholder: "Example: Research Mode",
    }),
  ]);

  const profileSelectRow = el("div", {
    class: "row",
    id: "profile_select_row",
    style: { display: "none" },
  }, [
    el("label", { for: "profile_select" }, ["Saved Profile"]),
    el("select", { id: "profile_select", class: "input" }),
  ]);

  const profileActions = el("div", {
    class: "row",
    id: "profile_actions",
    style: { display: "none" },
  }, [
    el("button", { type: "button", class: "btn", id: "profile_confirm" }, ["Confirm"]),
    el("button", { type: "button", class: "btn", id: "profile_save" }, ["Save Profile"]),
    el("button", { type: "button", class:"btn", id: "profile_save_edits"}, ["Save Edits"])
  ]);

  const selectRow = el("div", { class: "row" }, [
    el("label", { for: "tmpl_select" }, ["Prompt Template"]),

    el("div", {
      style: {
        display: "flex",
        gap: "6px",
        alignItems: "center",
      },
    }, [
      el("select", {
        id: "tmpl_select",
        class: "input",
        style: { flex: "1" },
      }),

      el("button", {
        type: "button",
        class: "btn",
        id: "tmpl_delete",
        title: "Delete selected user-made prompt template",
        style: { display: "none" },
      }, ["Delete Template"]),
    ]),
  ]);

  const details = el("div", { id: "tmpl_details" }, [
    el("div", { class: "row" }, [
      el("label", { for: "tmpl_name" }, ["Name"]),
      el("input", {
        id: "tmpl_name",
        class: "input",
        type: "text",
        placeholder: "Example: Technical Helper",
      }),
    ]),

    el("div", { class: "row" }, [
      el("label", { for: "tmpl_description" }, ["Description"]),
      el("textarea", {
        id: "tmpl_description",
        class: "textarea",
        placeholder: "Short description of what this prompt does.",
        style: { minHeight: "70px" },
      }),
    ]),

    el("div", { class: "row" }, [
      el("label", { for: "tmpl_system" }, ["System"]),
      el("textarea", {
        id: "tmpl_system",
        class: "textarea",
        placeholder: "System instructions for the assistant.",
        style: { minHeight: "130px" },
      }),
    ]),
  ]);

  const compactSettingsRow = el("div", {
    class: "row assistant-compact-row",
    style: {
      display: "flex",
      alignItems: "end",
      justifyContent: "space-between",
      gap: "10px",
      flexWrap: "nowrap",
      width: "100%",
    },
  }, [
    el("div", {
      class: "assistant-number-settings",
      style: {
        display: "grid",
        gridTemplateColumns: "90px 75px 105px 170px",
        alignItems: "end",
        gap: "8px",
        flex: "0 0 auto"
      },
    }, [
        el("div", { class: "assistant-compact-field" }, [
          el("label", { for: "assistant_temperature" }, ["Temperature"]),
          el("input", {
            id: "assistant_temperature",
            class: "input",
            type: "number",
            min: "0",
            max: "2",
            step: "0.1",
            placeholder: "0.2",
            style: { width: "100%", boxSizing: "border-box" },
          }),
        ]),

        el("div", { class: "assistant-compact-field" }, [
          el("label", { for: "assistant_top_k" }, ["Top K"]),
          el("input", {
            id: "assistant_top_k",
            class: "input",
            type: "number",
            min: "0",
            step: "1",
            placeholder: "8",
            style: { width: "100%", boxSizing: "border-box" },
          }),
        ]),

        el("div", { class: "assistant-compact-field" }, [
          el("label", { for: "assistant_max_tokens" }, ["Max Tokens"]),
          el("input", {
            id: "assistant_max_tokens",
            class: "input",
            type: "number",
            min: "1",
            step: "1",
            placeholder: "512",
            style: { width: "100%", boxSizing: "border-box" },
          }),
        ]),
      ]),
        
        el("div", { class: "assistant-compact-field assistant-rag-mode-field" }, [
          el("label", { for: "assistant_rag_toggle" }, ["Mode"]),
          el("div", { class: "rag-mode-toggle-wrap" }, [
            el("span", { class: "rag-mode-label" }, ["Conversation"]),
            el("label", { class: "rag-toggle" }, [
              el("input", {
                id: "assistant_rag_toggle",
                type: "checkbox",
                checked: true,
              }),
              el("span", { class: "rag-toggle-slider" }),
            ]),
            el("span", { class: "rag-mode-label" }, ["Search"]),
          ]),
        ]),

    el("div", {
      class: "assistant-manage-buttons",
      style: {
        display: "flex",
        alignItems: "end",
        gap: "6px",
        marginLeft: "auto",
      },
    }, [
      el("button", {
        type: "button",
        class: "btn",
        id: "manage_mcps",
      }, ["Manage MCP's"]),

      el("button", {
        type: "button",
        class: "btn",
        id: "manage_api_keys",
      }, ["Manage API Keys"]),
    ]),
  ])

  const providerRow = el("div", { class: "row" }, [
    el("label", { for: "assistant_llm_provider" }, ["LLM Provider"]),
    el("select", { id: "assistant_llm_provider", class: "input" }, [
      el("option", { value: "ollama" }, ["Ollama"]),
    ]),
  ]);

  const modelRow = el("div", { class: "row" }, [
    el("label", { for: "assistant_llm_model" }, ["Chat Model"]),
    el("select", { id: "assistant_llm_model", class: "input" }),
  ]);

  const personaManageRow = el("div", { class: "row" }, [
    el("label", {}, ["Personas"]),

    el("div", {
      class: "assistant-action-buttons",
      style: {
        display: "flex",
        gap: "6px",
        justifyContent: "flex-start",
        alignItems: "center",
        flexWrap: "wrap",
      },
    }, [
      el("button", {
        type: "button",
        class: "btn",
        id: "persona_create_btn",
        "data-persona-action": "create",
      }, ["Create Persona"]),

      el("button", {
        type: "button",
        class: "btn",
        id: "persona_load_btn",
        "data-persona-action": "load",
      }, ["Load Persona"]),

      el("button", {
        type: "button",
        class: "btn",
        id: "persona_delete_btn",
        "data-persona-action": "delete",
      }, ["Delete Persona"]),
    ]),

    // Keep this hidden select so prompt_editor.js can still use personaAction.value.
    el("select", {
      id: "persona_action",
      class: "input",
      style: { display: "none" },
    }, [
      el("option", { value: "" }, ["Manage Personas"]),
      el("option", { value: "create" }, ["Create Persona"]),
      el("option", { value: "load" }, ["Load Persona"]),
      el("option", { value: "delete" }, ["Delete Persona"]),
    ]),
  ]);

  const personaSelectRow = el("div", {
    class: "row",
    id: "persona_select_row",
    style: { display: "none" },
  }, [
    el("label", { for: "persona_select" }, ["Saved Persona"]),
    el("select", { id: "persona_select", class: "input" }),
  ]);

  const personaConfirmRow = el("div", {
    class: "row",
    id: "persona_confirm_row",
    style: { display: "none" },
  }, [
    el("button", { type: "button", class: "btn", id: "persona_confirm" }, ["Confirm"]),
  ]);

  const personaEditor = el("div", {
    id: "persona_editor",
    style: { display: "none" },
  }, [
    el("div", { class: "row" }, [
      el("label", { for: "persona_name" }, ["Persona Name"]),
      el("input", {
        id: "persona_name",
        class: "input",
        type: "text",
        placeholder: "Example: Engineering Tutor",
      }),
    ]),

    el("div", { class: "row" }, [
      el("label", { for: "assistant_persona" }, ["Persona"]),
      el("textarea", {
        id: "assistant_persona",
        class: "textarea",
        placeholder: "Write the persona instructions here.",
        style: { minHeight: "90px" },
      }),
    ]),

    el("div", { class: "row" }, [
      el("button", { type: "button", class: "btn", id: "persona_save" }, ["Save Persona"]),
    ]),
  ]);

  const templateActions = el("div", { class: "row" }, [
    el("button", { type: "button", class: "btn", id: "tmpl_save" }, ["Save Template"]),
  ]);

  wrap.append(
    profileManageRow,
    profileCreateRow,
    profileSelectRow,
    profileActions,

    selectRow,
    details,

    personaManageRow,
    personaSelectRow,
    personaConfirmRow,
    personaEditor,

    compactSettingsRow,
    templateActions,

    providerRow,
    modelRow,
  );

  return wrap;
}
