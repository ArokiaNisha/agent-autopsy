# Agent Autopsy

> **Find why your AI agent failed. Fix the prompt, tool call, or workflow.**

[![Powered by BharatCode](https://img.shields.io/badge/Powered%20by-BharatCode-22d3ee?style=for-the-badge)](https://bharatcode.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge)](LICENSE)
[![Built for BharatCode Build League](https://img.shields.io/badge/Built%20for%20BharatCode%20Build%20League-0e1628?style=for-the-badge)](https://bharatcode.ai)

**Live demo:** https://agent-autopsy-gamma.vercel.app

**GitHub repository:** https://github.com/ArokiaNisha/agent-autopsy

**Backend API endpoint:** https://agent-autopsy-agbw3tt5o-arokianishaaldy-9310s-projects.vercel.app/api/debug

Paste a failed agent run. Get the root cause, the exact step that broke, a rewritten prompt and a corrected tool call, ready to copy and re-run.

---

## The problem

AI agents rarely fail loudly. They fail because of:

- An ambiguous or incomplete system prompt
- The wrong tool being picked for the job
- A bad argument, for example `" ORD-10482 "` with stray spaces
- Invalid JSON in a tool call, such as trailing commas, single quotes or markdown fences
- Missing context or badly formatted output

Developers then spend time reading prompts, model replies, tool outputs and error messages to understand what went wrong first.

## The solution

**Agent Autopsy** is a lightweight web app that turns a failed agent run into a structured diagnosis.

You fill a guided form, a BharatCode model analyzes it, and you get:

| Field | What you get |
|---|---|
| Issue | A short, specific title |
| Failure type | `prompt`, `tool_call`, `json_format`, `missing_context`, `model_output` or `workflow` |
| Root cause | A clear explanation of why it failed |
| Problematic step | The exact field or step that failed first |
| Confidence | `high`, `medium` or `low` |
| Improved prompt | A complete rewritten prompt |
| Corrected tool call | Valid JSON you can copy and re-run, or `null` |
| Next steps | Ordered actions, including how to verify the fix |

## What makes it different

This is not a generic “paste an error into a chatbot” tool.

It is a structured debugging workflow:

1. A guided form captures the right evidence in the right fields.
2. The prompt encourages earliest-failure-first reasoning, so a downstream tool error can be traced back to the bad call or prompt that caused it.
3. The backend validates and normalizes a fixed JSON schema, so the UI stays consistent.
4. You get runnable artifacts, such as an improved prompt and corrected tool call, not just advice.

## Key features

- Guided debugging form
- One-click realistic examples
- Structured result panel
- Failure type and confidence badges
- Before / After comparison
- Copy buttons for improved prompt and corrected tool call
- Save cases in browser localStorage
- Download diagnosis as Markdown
- Dark, responsive developer-tool UI
- No login and no database
- BharatCode API key never exposed in the browser

## How it works

```text
Browser frontend
        |
        |  POST /api/debug
        v
Vercel serverless function
        |
        |  Authorization: Bearer <BHARATCODE_API_KEY>
        v
BharatCode model API
        |
        |  Structured JSON diagnosis
        v
Validated result in browser
```

1. The frontend sends the form fields to `/api/debug`.
2. The backend validates the request and builds a debugging prompt.
3. It calls the BharatCode Chat Completions API.
4. The model returns a structured JSON diagnosis.
5. The backend validates and normalizes the response.
6. The frontend displays the diagnosis, improved prompt, corrected tool call and next steps.

## BharatCode API usage

Agent Autopsy uses the BharatCode model API through an OpenAI-compatible Chat Completions request.

- Endpoint: `https://bharatcode.ai/api/model/v1/chat/completions`
- Authorization: `Bearer <BHARATCODE_API_KEY>`
- Default model: `qwen-3.8-27b`
- Temperature: `0.2`

The API key is stored only as an environment variable in the Vercel backend. It is never exposed to the browser or committed to GitHub.

## Privacy and API key safety

- The BharatCode API key is stored only in the Vercel backend environment.
- It is never included in frontend code or committed to GitHub.
- `.env` files are ignored by Git.
- The backend does not store requests in a database.
- Saved cases are stored only in your browser’s localStorage.
- Do not paste real passwords, API keys or personal data into the form.

## Run locally

Requirements:

- Node.js 18 or newer
- A BharatCode account with API access

```bash
git clone [https://github.com/ArokiaNisha/agent-autopsy.git](https://github.com/ArokiaNisha/agent-autopsy.git)
cd agent-autopsy
npm install
cp .env.example .env
```

On Windows, use:

```bash
copy .env.example .env
```

Open `.env` and add:

```env
BHARATCODE_API_KEY=your_bharatcode_api_key
BHARATCODE_MODEL=qwen-3.8-27b
BHARATCODE_API_URL=[https://bharatcode.ai/api/model/v1/chat/completions](https://bharatcode.ai/api/model/v1/chat/completions)
ALLOWED_ORIGINS=[https://ArokiaNisha.github.io](https://ArokiaNisha.github.io)
```

Then run:

```bash
npx vercel dev
```

Open:

```text
http://localhost:3000
```

## Try it yourself

Open the live demo:

https://agent-autopsy-gamma.vercel.app

Load one of the built-in examples:

- Whitespace in a tool argument
- Invalid JSON tool call
- Wrong tool selected

Then click **Analyze failure**.

## Evaluation

Agent Autopsy includes 12 realistic failed agent runs in `EVAL_CASES.md`.

Each case tests one failure type:

- Tool call errors
- JSON format errors
- Prompt issues
- Missing context
- Model output issues
- Workflow issues

Run each case once and record:

- Expected failure type
- Actual failure type
- Whether the root cause was correct
- Whether the suggested fix would work

Failure-type accuracy is calculated as:

```text
correct failure types / 12
```

## Screenshots

Add screenshots here after uploading them to `docs/screenshots/`.

```md






```

## Limitations

- The AI can be wrong. Always review the diagnosis before applying a fix.
- Agent Autopsy only sees the information you paste.
- It cannot automatically re-run your agent or verify that a fix works.
- Results depend on BharatCode API availability and access.
- The confidence value is model-reported, not a measured probability.
- There is no automatic redaction of secrets in pasted text yet.

## Roadmap

- Redact secrets before sending text to the API
- Add automated tests and CI for the backend
- Publish evaluation accuracy results
- Import runs from common agent log formats
- Add team workspaces and shared case history

## Project structure

```text
agent-autopsy/
├── BharatCode.txt
├── README.md
├── EVAL_CASES.md
├── LICENSE
├── .gitignore
├── .env.example
├── package.json
├── vercel.json
├── index.html
├── styles.css
├── app.js
├── api/
│   └── debug.js
├── examples/
│   ├── whitespace-tool-call.md
│   ├── invalid-json-tool-call.md
│   └── wrong-tool-selection.md
└── docs/
    ├── demo-script.md
    └── screenshots/
```

## License

MIT © 2026 Arokia Nisha. See [LICENSE](LICENSE).

Built for the BharatCode Build League. Powered by BharatCode.
