/* Agent Autopsy - frontend logic
 * Static site. Talks ONLY to your own backend (/api/debug). No API key lives here.
 */
(() => {
  "use strict";

  /* ===================== CONFIG ===================== */
  // After you deploy the backend to Vercel, paste its URL here (no trailing slash).
  // Example: "https://agent-autopsy-api.vercel.app"
  // When the site itself is served from Vercel or localhost, "/api/debug" is used automatically.
  const BACKEND_URL = "https://YOUR-VERCEL-PROJECT.vercel.app";

  const API_ENDPOINT = (() => {
    const h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return "/api/debug";
    if (!BACKEND_URL || BACKEND_URL.includes("YOUR-VERCEL-PROJECT")) return null;
    return BACKEND_URL.replace(/\/+$/, "") + "/api/debug";
  })();

  const STORE_KEY = "agentAutopsy.cases.v1";
  const MAX_CASES = 50;
  const FIELD_IDS = [
    "objective", "systemPrompt", "modelResponse", "toolCall",
    "toolOutput", "errorMessage", "expectedOutput", "notes",
  ];
  const TYPE_LABELS = {
    prompt: "Prompt",
    tool_call: "Tool call",
    json_format: "JSON format",
    missing_context: "Missing context",
    model_output: "Model output",
    workflow: "Workflow",
  };

  /* ===================== EXAMPLES ===================== */
  const EXAMPLES = {
    whitespace: {
      objective: "Check the shipping status of order ORD-10482 and tell the customer when it will arrive.",
      systemPrompt:
        "You are a helpful customer-support agent for ShopKart.\n" +
        "You can call tools to look up orders.\n\n" +
        "Tools:\n- get_order_status(order_id: string)\n\n" +
        "Always answer politely and briefly.",
      modelResponse: "Sure, I'll look that up for you right away.",
      toolCall: JSON.stringify(
        { name: "get_order_status", arguments: { order_id: " ORD-10482 " } },
        null,
        2
      ),
      toolOutput: "{\"error\": \"OrderNotFound\", \"message\": \"No order found with id ' ORD-10482 '\"}",
      errorMessage: "404 OrderNotFound: No order found with id ' ORD-10482 '",
      expectedOutput: "The agent replies: Order ORD-10482 shipped on 8 Nov and will arrive by 12 Nov.",
      notes: "The order definitely exists. Typing the ID by hand in the admin panel works.",
    },
    invalidjson: {
      objective: "Schedule a design review on 12 Nov 2026 with Ravi and Meena.",
      systemPrompt:
        "You are a scheduling assistant. When the user wants a meeting, call the tool create_calendar_event.\n\n" +
        "Tool schema:\ncreate_calendar_event(title: string, date: string (YYYY-MM-DD), attendees: string[])",
      modelResponse: "Sure! Scheduling it now. Here is the call:",
      toolCall:
        "```json\n{\n  'name': 'create_calendar_event',\n  \"arguments\": {\n    \"title\": \"Design review\",\n" +
        "    \"date\": \"2026-11-12\",\n    \"attendees\": [\"ravi@example.com\", \"meena@example.com\",],\n  }\n}\n```",
      toolOutput: "",
      errorMessage: "JSONDecodeError: Expecting property name enclosed in double quotes: line 2 column 3 (char 4)",
      expectedOutput: "A calendar event is created and the agent confirms the time and attendees.",
      notes: "Happens about 1 in 5 runs. The tool parser calls json.loads on the raw model output.",
    },
    wrongtool: {
      objective: "How much did we spend on cloud infrastructure last month? Give me the exact total in INR.",
      systemPrompt:
        "You are a finance assistant. You have these tools: search_web, query_database, send_email.\n" +
        "Use whichever tool you think is best to answer the user.",
      modelResponse: "I'll search for that information.",
      toolCall: JSON.stringify(
        { name: "search_web", arguments: { query: "total cloud infrastructure spend last month in INR" } },
        null,
        2
      ),
      toolOutput:
        "Top results: 1) 'Cloud spending trends 2026 - Gartner'  2) 'How to reduce your AWS bill'  3) 'Cloud cost calculators'",
      errorMessage:
        "No exception was raised, but the final answer was: \"I could not find your company's exact cloud spend.\"",
      expectedOutput: "An exact INR total read from the billing table using query_database.",
      notes: "The billing_costs table has the columns: month, service, amount_inr.",
    },
  };

  /* ===================== HELPERS ===================== */
  const $ = (id) => document.getElementById(id);
  let current = null;       // { inputs, diagnosis, model }
  let currentCaseId = null; // id of the saved case being viewed, if any
  let busy = false;
  let toastTimer = null;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function getInputs() {
    const o = {};
    FIELD_IDS.forEach((id) => { o[id] = $(id).value; });
    return o;
  }

  function setInputs(o) {
    FIELD_IDS.forEach((id) => { $(id).value = (o && o[id]) || ""; });
  }

  function showState(name) {
    ["Empty", "Loading", "Error", "Content"].forEach((n) => {
      $("result" + n).hidden = n !== name;
    });
  }

  function showError(msg) {
    $("errorText").textContent = msg;
    showState("Error");
  }

  function formatToolCall(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch (_) { return String(v); }
  }

  async function copyText(text, label) {
    if (!text) { toast("Nothing to copy"); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast((label || "Text") + " copied");
    } catch (_) {
      toast("Copy failed. Select the text and copy manually.");
    }
  }

  function fence(text, lang) {
    const runs = (String(text).match(/`+/g) || []).map((s) => s.length);
    const n = Math.max(3, (runs.length ? Math.max.apply(null, runs) : 0) + 1);
    const f = "`".repeat(n);
    return f + (lang || "") + "\n" + text + "\n" + f;
  }

  function toMarkdown(inputs, d) {
    const tool = formatToolCall(d.corrected_tool_call);
    const line = (label, v) => "### " + label + "\n" + (v && v.trim() ? fence(v.trim()) : "_not provided_") + "\n";
    const out = [];
    out.push("# Agent Autopsy: " + d.issue + "\n");
    out.push("- **Failure type:** " + (TYPE_LABELS[d.failure_type] || d.failure_type));
    out.push("- **Confidence:** " + d.confidence);
    out.push("- **Problematic step:** `" + String(d.problematic_step).replace(/`/g, "'") + "`");
    out.push("- **Generated:** " + new Date().toLocaleString() + "\n");
    out.push("## Root cause\n" + d.root_cause + "\n");
    out.push("## Improved prompt\n" + fence(d.improved_prompt || "(none)") + "\n");
    out.push("## Corrected tool call\n" + (tool ? fence(tool, "json") : "_No tool call correction needed._") + "\n");
    out.push("## Next steps\n" + d.next_steps.map((s, i) => (i + 1) + ". " + s).join("\n") + "\n");
    out.push("---\n\n## Original run\n");
    out.push(line("User objective", inputs.objective));
    out.push(line("Agent system prompt", inputs.systemPrompt));
    out.push(line("Model response", inputs.modelResponse));
    out.push(line("Tool call", inputs.toolCall));
    out.push(line("Tool output", inputs.toolOutput));
    out.push(line("Error message", inputs.errorMessage));
    out.push(line("Expected output", inputs.expectedOutput));
    out.push(line("Notes", inputs.notes));
    out.push("---\n_Generated by Agent Autopsy. Powered by BharatCode._\n");
    return out.join("\n");
  }

  function slug(s) {
    return (String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50)) || "diagnosis";
  }

  /* ===================== ANALYZE ===================== */
  function validate(i) {
    if (!i.objective.trim()) return "Please describe the user objective first.";
    const evidence = [i.modelResponse, i.toolCall, i.toolOutput, i.errorMessage].some((s) => s.trim());
    if (!evidence) return "Add at least one of: model response, tool call, tool output or error message.";
    return null;
  }

  function setBusy(on) {
    const b = $("btnAnalyze");
    b.disabled = on;
    b.textContent = on ? "Analyzing..." : "Analyze failure";
  }

  async function analyze() {
    if (busy) return;
    const inputs = getInputs();
    const problem = validate(inputs);
    if (problem) { showError(problem); return; }
    if (!API_ENDPOINT) {
      showError("The backend URL is not set yet. Open app.js and set BACKEND_URL to your deployed Vercel URL.");
      return;
    }

    busy = true;
    setBusy(true);
    showState("Loading");
    currentCaseId = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
        signal: controller.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (_) { /* non-JSON response */ }
      if (!res.ok || !data || !data.diagnosis) {
        throw new Error((data && data.error) || "Request failed (" + res.status + ").");
      }
      current = { inputs, diagnosis: data.diagnosis, model: data.model || "" };
      renderResult(current);
      if (window.matchMedia("(max-width: 980px)").matches) {
        $("resultPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      let msg = err.message;
      if (err.name === "AbortError") msg = "The request took too long. Please try again.";
      else if (err instanceof TypeError) msg = "Could not reach the backend. Check your connection, the BACKEND_URL setting and the backend's ALLOWED_ORIGINS.";
      showError(msg);
    } finally {
      clearTimeout(timer);
      busy = false;
      setBusy(false);
    }
  }

  /* ===================== RENDER ===================== */
  function renderResult(c) {
    const d = c.diagnosis;
    const i = c.inputs;

    $("issueTitle").textContent = d.issue;
    $("typeBadge").textContent = TYPE_LABELS[d.failure_type] || d.failure_type;
    const cb = $("confBadge");
    cb.className = "badge conf-" + d.confidence;
    cb.textContent = d.confidence.charAt(0).toUpperCase() + d.confidence.slice(1) + " confidence";
    $("modelTag").textContent = c.model ? "model: " + c.model : "";
    $("rootCause").textContent = d.root_cause;
    $("problematicStep").textContent = d.problematic_step;
    $("improvedPrompt").textContent = d.improved_prompt || "(no prompt change suggested)";

    const tool = formatToolCall(d.corrected_tool_call);
    $("correctedToolCall").textContent = tool || "No tool call correction needed.";
    $("btnCopyTool").disabled = !tool;

    const ol = $("nextSteps");
    ol.textContent = "";
    d.next_steps.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      ol.appendChild(li);
    });

    const none = "(not provided)";
    $("cmpPromptBefore").textContent = i.systemPrompt.trim() || none;
    $("cmpPromptAfter").textContent = d.improved_prompt || none;
    $("cmpToolBefore").textContent = i.toolCall.trim() || none;
    $("cmpToolAfter").textContent = tool || "No tool call correction needed.";
    $("cmpErrorBefore").textContent = i.errorMessage.trim() || i.toolOutput.trim() || none;
    $("cmpErrorAfter").textContent = i.expectedOutput.trim() || none;

    selectTab("diagnosis");
    showState("Content");
  }

  function selectTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("panelDiagnosis").hidden = name !== "diagnosis";
    $("panelCompare").hidden = name !== "compare";
  }

  /* ===================== SAVED CASES ===================== */
  function loadCases() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY));
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }

  function storeCases(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; }
    catch (_) { return false; }
  }

  function saveCurrent() {
    if (!current) return;
    const list = loadCases();
    const now = new Date().toISOString();

    if (currentCaseId) {
      const found = list.find((c) => c.id === currentCaseId);
      if (found) {
        found.inputs = current.inputs;
        found.diagnosis = current.diagnosis;
        if (!storeCases(list)) { toast("Could not save: browser storage is blocked"); return; }
        renderSaved();
        toast("Case updated");
        return;
      }
    }

    let title = window.prompt("Case title", current.diagnosis.issue);
    if (title === null) return;
    title = title.trim() || current.diagnosis.issue;

    const item = {
      id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title,
      date: now,
      status: "Open",
      inputs: current.inputs,
      diagnosis: current.diagnosis,
    };
    list.unshift(item);
    if (list.length > MAX_CASES) list.length = MAX_CASES;
    if (!storeCases(list)) { toast("Could not save: browser storage is blocked"); return; }
    currentCaseId = item.id;
    renderSaved();
    toast("Case saved");
  }

  function renderSaved() {
    const list = loadCases();
    const box = $("savedList");
    box.textContent = "";
    $("savedCount").textContent = String(list.length);
    $("savedEmpty").hidden = list.length > 0;
    $("btnClearSaved").hidden = list.length === 0;

    list.forEach((c) => {
      const row = document.createElement("article");
      row.className = "card saved-item";

      const main = document.createElement("div");
      main.className = "saved-main";
      const h = document.createElement("h4");
      h.textContent = c.title;
      const meta = document.createElement("div");
      meta.className = "saved-meta";

      const st = document.createElement("span");
      st.className = "status " + (c.status === "Fixed" ? "fixed" : "open");
      st.textContent = c.status;
      const ty = document.createElement("span");
      ty.textContent = TYPE_LABELS[c.diagnosis && c.diagnosis.failure_type] || "";
      const dt = document.createElement("span");
      dt.textContent = new Date(c.date).toLocaleString();
      meta.appendChild(st);
      if (ty.textContent) meta.appendChild(ty);
      meta.appendChild(dt);
      main.appendChild(h);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "saved-actions";
      [
        ["open", "Open", "btn btn-ghost btn-sm"],
        ["toggle", c.status === "Fixed" ? "Reopen" : "Mark fixed", "btn btn-ghost btn-sm"],
        ["delete", "Delete", "btn btn-ghost btn-sm"],
      ].forEach((a) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.action = a[0];
        b.dataset.id = c.id;
        b.className = a[2];
        b.textContent = a[1];
        actions.appendChild(b);
      });

      row.appendChild(main);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function openCase(id) {
    const c = loadCases().find((x) => x.id === id);
    if (!c) return;
    setInputs(c.inputs);
    current = { inputs: c.inputs, diagnosis: c.diagnosis, model: "" };
    currentCaseId = c.id;
    renderResult(current);
    $("debugger").scrollIntoView({ behavior: "smooth" });
    toast("Case reopened");
  }

  function onSavedClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === "open") return openCase(id);
    const list = loadCases();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) return;
    if (action === "toggle") {
      list[idx].status = list[idx].status === "Fixed" ? "Open" : "Fixed";
      storeCases(list);
      renderSaved();
    } else if (action === "delete") {
      if (!window.confirm("Delete this saved case?")) return;
      list.splice(idx, 1);
      storeCases(list);
      if (currentCaseId === id) currentCaseId = null;
      renderSaved();
      toast("Case deleted");
    }
  }

  /* ===================== ACTIONS ===================== */
  function loadExample(key) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    setInputs(ex);
    current = null;
    currentCaseId = null;
    showState("Empty");
    $("debugger").scrollIntoView({ behavior: "smooth" });
    toast("Example loaded. Press Analyze failure.");
  }

  function clearForm() {
    setInputs({});
    current = null;
    currentCaseId = null;
    showState("Empty");
  }

  function downloadMarkdown() {
    if (!current) return;
    const md = toMarkdown(current.inputs, current.diagnosis);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-autopsy-" + slug(current.diagnosis.issue) + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Markdown downloaded");
  }

  /* ===================== WIRING ===================== */
  function init() {
    $("debugForm").addEventListener("submit", (e) => { e.preventDefault(); analyze(); });
    $("debugForm").addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); analyze(); }
    });
    $("btnRetry").addEventListener("click", analyze);
    $("btnClear").addEventListener("click", clearForm);

    document.querySelectorAll("[data-example]").forEach((b) => {
      b.addEventListener("click", () => loadExample(b.dataset.example));
    });
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => selectTab(t.dataset.tab));
    });

    $("btnCopyPrompt").addEventListener("click", () => current && copyText(current.diagnosis.improved_prompt, "Improved prompt"));
    $("btnCopyTool").addEventListener("click", () => current && copyText(formatToolCall(current.diagnosis.corrected_tool_call), "Corrected tool call"));
    $("btnCopyAll").addEventListener("click", () => current && copyText(toMarkdown(current.inputs, current.diagnosis), "Full diagnosis"));
    $("btnDownload").addEventListener("click", downloadMarkdown);
    $("btnSave").addEventListener("click", saveCurrent);

    $("savedList").addEventListener("click", onSavedClick);
    $("btnClearSaved").addEventListener("click", () => {
      if (!window.confirm("Delete all saved cases from this browser?")) return;
      storeCases([]);
      currentCaseId = null;
      renderSaved();
      toast("All cases deleted");
    });

    showState("Empty");
    renderSaved();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
