# Example 3: Wrong tool selected for the task

**Expected failure type:** `prompt` (or `workflow`) · **Expected confidence:** high

## The failed run

**User objective**
How much did we spend on cloud infrastructure last month? Give me the exact total in INR.

**Agent system prompt**
```
You are a finance assistant. You have these tools: search_web, query_database, send_email.
Use whichever tool you think is best to answer the user.
```

**Model response**
```
I'll search for that information.
```

**Tool call**
```json
{
  "name": "search_web",
  "arguments": { "query": "total cloud infrastructure spend last month in INR" }
}
```

**Tool output**
```
Top results: 1) 'Cloud spending trends 2026 - Gartner'  2) 'How to reduce your AWS bill'  3) 'Cloud cost calculators'
```

**Error message**
```
No exception was raised, but the final answer was: "I could not find your company's exact cloud spend."
```

**Expected output**
An exact INR total read from the billing table using `query_database`.

**Notes**
The `billing_costs` table has the columns: month, service, amount_inr.

## What a good diagnosis looks like

- **Issue:** Public web search used for private company data
- **Root cause:** The prompt lists tool names but never says what each one is for or what data it can reach. Company spend lives only in the billing database, so web search can never return it. The "use whichever tool you think is best" instruction leaves the choice to guesswork.
- **Problematic step:** Tool selection (`name: "search_web"`) caused by the system prompt's tool list
- **Fix (prompt):** Describe each tool and when to use it, and add a routing rule for internal data.
- **Improved prompt (excerpt)**
```
You are a finance assistant for our company.

Tools:
- query_database(sql: string): READ-ONLY SQL on internal data. Table billing_costs(month, service, amount_inr). Use this for ANY question about our company's spend, costs or revenue.
- search_web(query: string): public information only (market news, pricing pages). Never use it for internal company numbers.
- send_email(to, subject, body): only when the user explicitly asks to send an email.

Rules:
- For questions about company costs, call query_database first.
- Always report amounts in INR and state which month you used.
```
- **Corrected tool call**
```json
{
  "name": "query_database",
  "arguments": {
    "sql": "SELECT SUM(amount_inr) AS total_inr FROM billing_costs WHERE month = '2026-10'"
  }
}
```

## Why it matters

Most "the agent could not find it" failures are routing failures. Good tool descriptions and explicit routing rules fix them without touching any code.
