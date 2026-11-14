# Agent Autopsy Evaluation Cases

This file contains 12 realistic failed agent runs used to evaluate Agent Autopsy.

Each case includes:

- Objective
- System prompt
- Model response
- Tool call
- Tool output
- Error
- Expected output
- Expected failure type
- Expected root cause
- Expected fix

## How to use

1. Open Agent Autopsy.
2. Copy the fields of one case into the debugger form.
3. Leave a field empty when the case says `(empty)`.
4. Run the diagnosis once.
5. Compare the result with the expected diagnosis.
6. Record the result in the scoring sheet.

## Scoring sheet

| Case | Expected type | Got type | Root cause right? | Fix would work? |
|---|---|---|---|---|
| 1 | tool_call |  |  |  |
| 2 | tool_call |  |  |  |
| 3 | json_format |  |  |  |
| 4 | json_format |  |  |  |
| 5 | prompt |  |  |  |
| 6 | prompt |  |  |  |
| 7 | missing_context |  |  |  |
| 8 | missing_context |  |  |  |
| 9 | model_output |  |  |  |
| 10 | model_output |  |  |  |
| 11 | workflow |  |  |  |
| 12 | workflow |  |  |  |

Failure-type accuracy = number of correct `Got type` values divided by 12.

Where a case lists an “also acceptable” type, either answer is counted as correct.

## Case 1: Stray spaces in order ID

**Expected type:** `tool_call`

**Expected root cause:** Leading and trailing spaces in `order_id`.

**Expected fix:** Send `order_id` as `"ORD-10482"` with no spaces, and add an instruction to trim IDs.

**Objective:**

```text
Look up the status of order ORD-10482 for a customer.
```

**System prompt:**

```text
You are a support agent. Use the get_order_status tool to answer order questions.
```

**Model response:**

```text
I couldn't find that order. Please check the order number.
```

**Tool call:**

```json
{"tool": "get_order_status", "arguments": {"order_id": " ORD-10482 "}}
```

**Tool output:**

```json
{"error": "ORDER_NOT_FOUND", "message": "No order matches ' ORD-10482 '"}
```

**Error:**

```text
ORDER_NOT_FOUND
```

**Expected output:**

```text
The current status of order ORD-10482.
```

## Case 2: Wrong tool chosen

**Expected type:** `tool_call`

**Expected root cause:** The agent called `create_invoice` when it should have called `send_email`.

**Expected fix:** Make a `send_email` call that attaches or references invoice `INV-2201`.

**Objective:**

```text
Email the existing invoice INV-2201 to the customer at priya@example.com.
```

**System prompt:**

```text
You are a billing assistant. Tools available: create_invoice(customer_id, items), send_email(to, subject, body), get_invoice(invoice_id).
```

**Model response:**

```text
I tried to send the invoice but something went wrong.
```

**Tool call:**

```json
{"tool": "create_invoice", "arguments": {"customer_id": "C-204", "items": ["Annual plan"]}}
```

**Tool output:**

```json
{"error": "DUPLICATE_INVOICE", "message": "Invoice INV-2201 already exists for this customer"}
```

**Error:**

```text
DUPLICATE_INVOICE
```

**Expected output:**

```text
An email sent to priya@example.com containing invoice INV-2201.
```

## Case 3: Trailing comma and markdown fence

**Expected type:** `json_format`

**Expected root cause:** A trailing comma and/or markdown code fence around the JSON.

**Expected fix:** Return the same call as plain valid JSON, with no trailing comma and no markdown fences.

**Objective:**

```text
Create a high priority support ticket titled "Login broken".
```

**System prompt:**

```text
You are a helpdesk agent. Output tool calls as raw JSON only.
```

**Model response:**

```text
(empty)
```

**Tool call:**

```json
{"tool": "create_ticket", "arguments": {"title": "Login broken", "priority": "high",}}
```

**Tool output:**

```text
(empty)
```

**Error:**

```text
JSONDecodeError: Expecting property name enclosed in double quotes
```

**Expected output:**

```text
A ticket created with priority high.
```

**Notes:**

```text
The parser reads the model output directly with json.loads.
```

## Case 4: Single quotes in JSON

**Expected type:** `json_format`

**Expected root cause:** Single quotes were used instead of double quotes, producing a Python-style dictionary rather than valid JSON.

**Expected fix:** Use double quotes throughout the JSON.

**Objective:**

```text
Add 2 units of SKU-88 to the shopping cart.
```

**System prompt:**

```text
You are a shopping agent. Respond with a tool call in JSON.
```

**Model response:**

```text
(empty)
```

**Tool call:**

```text
{'tool': 'add_to_cart', 'arguments': {'sku': 'SKU-88', 'qty': 2}}
```

**Tool output:**

```text
(empty)
```

**Error:**

```text
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)
```

**Expected output:**

```text
2 units of SKU-88 added to the cart.
```

## Case 5: Prompt never asks for JSON

**Expected type:** `prompt`

**Expected root cause:** The system prompt asks the model to summarize, but never instructs it to return JSON with `intent` and `urgency`.

**Expected fix:** Rewrite the prompt to require a JSON object containing only `intent` and `urgency`.

**Objective:**

```text
Classify the customer message and return ONLY a JSON object with the fields intent and urgency, so the router can parse it.
```

**System prompt:**

```text
You are a helpful assistant. Summarize the customer's message.
```

**Model response:**

```text
Sure! Here's a quick summary: the customer is upset because their delivery is late.
```

**Tool call:**

```text
(empty)
```

**Tool output:**

```text
(empty)
```

**Error:**

```text
RouterError: could not parse model output as JSON
```

**Expected output:**

```json
{"intent": "delivery_delay", "urgency": "high"}
```

**Notes:**

```text
The customer message was "My order is 5 days late and nobody is replying!"
```

## Case 6: Refund rule missing from prompt

**Expected type:** `prompt`

**Expected root cause:** The system prompt does not state the 500 INR refund limit or the escalation rule.

**Expected fix:** Add a rule that refunds under 500 INR are automatic and anything above must be escalated to a human.

**Objective:**

```text
Refund orders under 500 INR automatically. Escalate anything above to a human.
```

**System prompt:**

```text
You are a support bot. Be concise and polite.
```

**Model response:**

```text
Your refund of 1200 INR has been issued.
```

**Tool call:**

```json
{"tool": "issue_refund", "arguments": {"order_id": "ORD-5531", "amount": 1200}}
```

**Tool output:**

```json
{"status": "success", "refund_id": "RF-9087"}
```

**Error:**

```text
(empty)
```

**Expected output:**

```text
A call to escalate_to_human, because 1200 is above 500.
```

**Notes:**

```text
The tool itself worked correctly.
```

## Case 7: “My usual flight” with no profile

**Expected type:** `missing_context`

**Expected root cause:** The agent has no information about the user’s home airport or usual preferences, so `origin` is null.

**Expected fix:** Provide the user profile, including home airport and preferred time, or ask the user for the origin first.

**Objective:**

```text
Book my usual morning flight to Chennai next Monday.
```

**System prompt:**

```text
You book flights using the book_flight tool.
```

**Model response:**

```text
I tried to book your flight but it failed.
```

**Tool call:**

```json
{"tool": "book_flight", "arguments": {"origin": null, "destination": "MAA", "date": "2026-11-16"}}
```

**Tool output:**

```json
{"error": "VALIDATION_ERROR", "message": "origin is required"}
```

**Error:**

```text
VALIDATION_ERROR: origin is required
```

**Expected output:**

```text
A booked morning flight to Chennai on Monday, from the user's home airport.
```

## Case 8: Empty retrieval, model guesses

**Expected type:** `missing_context`  
**Also acceptable:** `model_output`

**Expected root cause:** The document search returned no results, so the model answered without any source.

**Expected fix:** Handle the empty result by saying that the policy was not found, and investigate why the index returned no documents.

**Objective:**

```text
Answer questions about our leave policy using only the retrieved documents.
```

**System prompt:**

```text
You are an HR assistant. Answer from the retrieved documents only.
```

**Model response:**

```text
Employees get 24 days of paid leave per year.
```

**Tool call:**

```json
{"tool": "search_docs", "arguments": {"query": "leave policy"}}
```

**Tool output:**

```json
{"documents": []}
```

**Error:**

```text
(empty)
```

**Expected output:**

```text
A statement that no policy document was found, or the correct leave policy from the documents.
```

**Notes:**

```text
The document index may not have been built.
```

## Case 9: Model claims success after failure

**Expected type:** `model_output`

**Expected root cause:** The tool reported `INSUFFICIENT_STOCK`, but the model told the user that the order was placed.

**Expected fix:** Add a prompt rule to report tool failures honestly, and reply that only one unit is available and the order was not placed.

**Objective:**

```text
Place an order for 3 units of SKU-12.
```

**System prompt:**

```text
You are an ordering agent. Place orders with the place_order tool and report the result to the user.
```

**Model response:**

```text
Done! Your order for 3 units has been placed.
```

**Tool call:**

```json
{"tool": "place_order", "arguments": {"sku": "SKU-12", "qty": 3}}
```

**Tool output:**

```json
{"status": "failed", "error": "INSUFFICIENT_STOCK", "available": 1}
```

**Error:**

```text
(empty)
```

**Expected output:**

```text
A reply saying only 1 unit is available and the order was not placed.
```

## Case 10: Model ignores date format

**Expected type:** `model_output`

**Expected root cause:** The prompt clearly asks for `DD/MM/YYYY`, but the model wrote the date in words.

**Expected fix:** Add an example of the exact required date format and validate the format after the reply.

**Objective:**

```text
Tell the customer the delivery date of order ORD-7710.
```

**System prompt:**

```text
Always format dates as DD/MM/YYYY. Never write month names.
```

**Model response:**

```text
Your order will be delivered on November 15, 2026.
```

**Tool call:**

```text
(empty)
```

**Tool output:**

```json
{"order_id": "ORD-7710", "delivery_date": "2026-11-15"}
```

**Error:**

```text
(empty)
```

**Expected output:**

```text
Your order will be delivered on 15/11/2026.
```

**Notes:**

```text
A downstream parser rejected the reply because of the date format.
```

## Case 11: Agent loops on the same search

**Expected type:** `workflow`  
**Also acceptable:** `prompt`

**Expected root cause:** The same `search_products` call was repeated with no stop condition or step limit.

**Expected fix:** Add a stop rule, de-duplicate repeated calls, and add a final answer step.

**Objective:**

```text
Find the cheapest laptop under 60000 INR.
```

**System prompt:**

```text
You are a shopping agent. Keep searching until you are sure you found the best option.
```

**Model response:**

```text
Let me search once more to be sure.
```

**Tool call:**

```json
{"tool": "search_products", "arguments": {"query": "laptop under 60000"}}
```

**Tool output:**

```json
{"results": [{"name": "Laptop A", "price": 54990}, {"name": "Laptop B", "price": 58990}]}
```

**Error:**

```text
MaxIterationsError: agent stopped after 15 steps
```

**Expected output:**

```text
A final answer naming the cheapest laptop, Laptop A at 54990 INR.
```

**Notes:**

```text
The same search was called 14 times with the same query and the same results.
```

## Case 12: Payment taken before stock check

**Expected type:** `workflow`

**Expected root cause:** `charge_card` ran before `check_stock`, so the customer was charged for an unavailable item.

**Expected fix:** Reorder the steps: check stock first, then charge only if the item is available. Add a refund or compensation step for this failure.

**Objective:**

```text
Buy 1 unit of SKU-45 for the customer.
```

**System prompt:**

```text
You are a purchasing agent. Tools: check_stock(sku), charge_card(amount), place_order(sku). Complete the purchase.
```

**Model response:**

```text
I'm sorry, the item turned out to be out of stock.
```

**Tool call:**

```json
[
  {"tool": "charge_card", "arguments": {"amount": 2499}},
  {"tool": "check_stock", "arguments": {"sku": "SKU-45"}}
]
```

**Tool output:**

```json
[
  {"status": "charged"},
  {"in_stock": false}
]
```

**Error:**

```text
Customer charged 2499 INR but no order was placed.
```

**Expected output:**

```text
Stock checked first, then payment only if the item is available.
```
