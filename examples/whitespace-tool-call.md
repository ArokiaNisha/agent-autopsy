# Example 1: Extra whitespace in a tool argument

**Expected failure type:** `tool_call` · **Expected confidence:** high

## The failed run

**User objective**
Check the shipping status of order ORD-10482 and tell the customer when it will arrive.

**Agent system prompt**
```
You are a helpful customer-support agent for ShopKart.
You can call tools to look up orders.

Tools:
- get_order_status(order_id: string)

Always answer politely and briefly.
```

**Model response**
```
Sure, I'll look that up for you right away.
```

**Tool call**
```json
{
  "name": "get_order_status",
  "arguments": { "order_id": " ORD-10482 " }
}
```

**Tool output / error**
```
404 OrderNotFound: No order found with id ' ORD-10482 '
```

**Expected output**
The agent replies: Order ORD-10482 shipped on 8 Nov and will arrive by 12 Nov.

## What a good diagnosis looks like

- **Issue:** Leading and trailing spaces in `order_id`
- **Root cause:** The model copied the ID with surrounding whitespace. The tool compares IDs exactly, so `" ORD-10482 "` does not match `ORD-10482`. The 404 is a symptom, not the cause.
- **Problematic step:** `arguments.order_id`
- **Fix 1 (prompt):** Add a rule such as "Pass identifiers exactly as plain strings with no leading or trailing spaces."
- **Fix 2 (code):** Trim string arguments before calling the tool.
- **Corrected tool call**
```json
{
  "name": "get_order_status",
  "arguments": { "order_id": "ORD-10482" }
}
```

## Why it matters

Whitespace bugs are invisible in logs and look like "the data does not exist". Tracing the 404 back to the argument saves an hour of checking the database.
