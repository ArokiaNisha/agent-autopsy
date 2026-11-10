# Example 2: Invalid JSON in a tool call

**Expected failure type:** `json_format` · **Expected confidence:** high

## The failed run

**User objective**
Schedule a design review on 12 Nov 2026 with Ravi and Meena.

**Agent system prompt**
```
You are a scheduling assistant. When the user wants a meeting, call the tool create_calendar_event.

Tool schema:
create_calendar_event(title: string, date: string (YYYY-MM-DD), attendees: string[])
```

**Model response**
```
Sure! Scheduling it now. Here is the call:
```

**Tool call (raw, as the parser received it)**
````
```json
{
  'name': 'create_calendar_event',
  "arguments": {
    "title": "Design review",
    "date": "2026-11-12",
    "attendees": ["ravi@example.com", "meena@example.com",],
  }
}
```
````

**Error message**
```
JSONDecodeError: Expecting property name enclosed in double quotes: line 2 column 3 (char 4)
```

**Expected output**
A calendar event is created and the agent confirms the time and attendees.

## What a good diagnosis looks like

- **Issue:** Tool call is not valid JSON
- **Root cause:** Three separate problems: the `name` key uses single quotes, two trailing commas (after the last array item and the last object property) are not allowed in JSON, and the whole call is wrapped in a markdown code fence that `json.loads` cannot parse.
- **Problematic step:** Raw tool call, line 2 (`'name'`)
- **Fix 1 (prompt):** Tell the model to output only a raw JSON object, with double quotes, no trailing commas and no markdown fences. Include one valid example call.
- **Fix 2 (code):** Strip code fences before parsing and retry once with the parser error fed back to the model.
- **Corrected tool call**
```json
{
  "name": "create_calendar_event",
  "arguments": {
    "title": "Design review",
    "date": "2026-11-12",
    "attendees": ["ravi@example.com", "meena@example.com"]
  }
}
```

## Why it matters

Intermittent parse failures ("1 in 5 runs") are usually formatting habits of the model. An explicit format rule plus a valid example fixes most of them.
