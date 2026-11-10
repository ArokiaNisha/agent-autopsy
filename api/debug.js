/**
 * Agent Autopsy - POST /api/debug
 * Vercel serverless function (Node 18+). Calls the BharatCode model API.
 * The API key lives ONLY in environment variables (never in the browser or repo).
 *
 * Env vars:
 *   BHARATCODE_API_KEY   (required)
 *   BHARATCODE_MODEL     (optional, default: qwen-3.8-27b)
 *   BHARATCODE_API_URL   (optional, default: https://bharatcode.ai/api/model/v1/chat/completions)
 *   ALLOWED_ORIGINS      (optional, comma separated, e.g. https://yourname.github.io)
 *
 * VERIFY endpoint + model name in the BharatCode docs before submitting.
 */

const API_URL =
  process.env.BHARATCODE_API_URL ||
  "https://bharatcode.ai/api/model/v1/chat/completions";
const DEFAULT_MODEL = "qwen-3.8-27b";

const MAX_FIELD_CHARS = 8000;
const MAX_TOTAL_CHARS = 30000;
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60 * 1000; // per minute per IP
const hits = new Map(); // best-effort, in-memory (resets on cold start)

const FIELDS = [
  "objective",
  "systemPrompt",
  "modelResponse",
  "toolCall",
  "toolOutput",
  "errorMessage",
  "expectedOutput",
  "notes",
];

const SYSTEM_PROMPT = `You are Agent Autopsy, a senior AI-agent debugging engineer. A developer gives you a failed run of an LLM agent: the objective, the agent's system prompt, the model response, the tool call, the tool output, the error, and the expected output.

Your job: find the EARLIEST likely point of failure, explain why it happened, and give the smallest fix that works.

Rules:
1. Be specific and practical. Quote the exact field, key, value or sentence that is wrong. Never give generic advice such as "be more clear" or "add more context".
2. Look for: ambiguous or missing instructions, wrong tool chosen, wrong or missing arguments, extra whitespace or wrong types in arguments, invalid JSON (trailing commas, single quotes, unescaped characters, markdown fences), missing context, hallucinated tool names, and output-format violations.
3. Find the root cause, not the symptom. If a tool error is only a consequence of an earlier bad tool call, blame the tool call.
4. "improved_prompt" must be the COMPLETE rewritten system prompt (not a diff, not a summary). Keep what already works and change only what is needed, adding explicit rules, formats, or examples that prevent this failure.
5. "corrected_tool_call" must be a valid JSON object the developer can paste and run. If no tool call is involved or it cannot be corrected, use null.
6. "confidence" is "high" only when the evidence in the input clearly proves the cause; "low" when you are mostly inferring.
7. "next_steps" has 3 to 5 short, concrete, ordered actions, including one way to verify the fix.
8. If information is missing, say what is missing in root_cause and lower the confidence. Do not invent facts.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary. Use exactly this schema:
{
  "issue": "short issue title",
  "failure_type": "prompt | tool_call | json_format | missing_context | model_output | workflow",
  "root_cause": "clear explanation",
  "problematic_step": "exact failing step or field",
  "confidence": "high | medium | low",
  "improved_prompt": "complete improved prompt",
  "corrected_tool_call": {} or null,
  "next_steps": ["step 1", "step 2", "step 3"]
}
"failure_type" must be exactly one of: prompt, tool_call, json_format, missing_context, model_output, workflow.
"confidence" must be exactly one of: high, medium, low.`;

function setCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const origin = (req.headers.origin || "").replace(/\/$/, "");
  if (allowed.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

function buildUserMessage(d) {
  const section = (label, value) =>
    `### ${label}\n${value && value.trim() ? value.trim() : "(not provided)"}\n`;
  return [
    "Diagnose this failed agent run.\n",
    section("USER OBJECTIVE", d.objective),
    section("AGENT SYSTEM PROMPT", d.systemPrompt),
    section("MODEL RESPONSE", d.modelResponse),
    section("TOOL CALL (JSON)", d.toolCall),
    section("TOOL OUTPUT", d.toolOutput),
    section("ERROR MESSAGE", d.errorMessage),
    section("EXPECTED OUTPUT", d.expectedOutput),
    section("EXTRA NOTES", d.notes),
    "Return only the JSON object described in your instructions.",
  ].join("\n");
}

function extractJson(text) {
  if (typeof text !== "string") throw new Error("Empty model response");
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch (_) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

function normalize(raw) {
  const types = [
    "prompt",
    "tool_call",
    "json_format",
    "missing_context",
    "model_output",
    "workflow",
  ];
  const confs = ["high", "medium", "low"];
  const str = (v, fallback) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  let failureType = String(raw.failure_type || "").toLowerCase().trim();
  if (!types.includes(failureType)) failureType = "workflow";
  let confidence = String(raw.confidence || "").toLowerCase().trim();
  if (!confs.includes(confidence)) confidence = "medium";

  let corrected = raw.corrected_tool_call;
  if (typeof corrected === "string") {
    const s = corrected.trim();
    if (!s || s.toLowerCase() === "null") corrected = null;
    else {
      try {
        corrected = JSON.parse(s);
      } catch (_) {
        corrected = s;
      }
    }
  }
  if (corrected === undefined) corrected = null;

  let steps = Array.isArray(raw.next_steps) ? raw.next_steps : [];
  steps = steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  if (steps.length === 0) steps = ["Re-run the agent with the improved prompt."];

  return {
    issue: str(raw.issue, "Agent failure"),
    failure_type: failureType,
    root_cause: str(raw.root_cause, "The model did not provide a root cause."),
    problematic_step: str(raw.problematic_step, "Not identified"),
    confidence,
    improved_prompt: str(raw.improved_prompt, ""),
    corrected_tool_call: corrected,
    next_steps: steps,
  };
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST /api/debug" });
  }

  const apiKey = process.env.BHARATCODE_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server is not configured: BHARATCODE_API_KEY is missing." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a minute and try again." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }

  const data = {};
  let total = 0;
  for (const f of FIELDS) {
    const v = body[f];
    if (v !== undefined && v !== null && typeof v !== "string") {
      return res.status(400).json({ error: `Field "${f}" must be a string.` });
    }
    data[f] = (v || "").toString();
    if (data[f].length > MAX_FIELD_CHARS) {
      return res.status(413).json({
        error: `Field "${f}" is too long (max ${MAX_FIELD_CHARS} characters).`,
      });
    }
    total += data[f].length;
  }
  if (total > MAX_TOTAL_CHARS) {
    return res.status(413).json({ error: "Input is too large." });
  }
  if (!data.objective.trim()) {
    return res.status(400).json({ error: "Please provide the user objective." });
  }
  const evidence = [
    data.modelResponse,
    data.toolCall,
    data.toolOutput,
    data.errorMessage,
  ].some((s) => s.trim());
  if (!evidence) {
    return res.status(400).json({
      error:
        "Provide at least one of: model response, tool call, tool output, or error message.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.BHARATCODE_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 2500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(data) },
        ],
      }),
    });

    if (!upstream.ok) {
      let detail = "";
      try {
        const e = await upstream.json();
        detail = e?.error?.message || e?.message || "";
      } catch (_) {}
      const map = {
        401: "BharatCode rejected the API key (401). Check BHARATCODE_API_KEY.",
        403: "BharatCode denied access (403). Check your key permissions.",
        404: "BharatCode endpoint or model not found (404). Verify the URL and model name.",
        429: "BharatCode rate limit reached (429). Try again shortly.",
      };
      return res.status(502).json({
        error:
          map[upstream.status] ||
          `BharatCode API error (${upstream.status}). ${detail}`.trim(),
      });
    }

    const json = await upstream.json();
    const content = json?.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = extractJson(content);
    } catch (e) {
      return res.status(502).json({
        error: "The model returned an unreadable answer. Please try again.",
      });
    }
    return res.status(200).json({
      diagnosis: normalize(parsed),
      model: json.model || process.env.BHARATCODE_MODEL || DEFAULT_MODEL,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      return res.status(504).json({ error: "BharatCode API timed out. Try again." });
    }
    return res.status(500).json({ error: "Unexpected server error." });
  } finally {
    clearTimeout(timer);
  }
};
