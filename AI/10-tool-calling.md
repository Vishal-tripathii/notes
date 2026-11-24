# AI Engineering Notes — Part 10

## Tool Calling ⭐⭐⭐⭐⭐

**Topics:** how tool calling works · tool definitions (name, description, JSON Schema) · tool selection & `tool_choice` · parallel tool calls · validating arguments · designing good tools · errors · too many tools · security.

---

## 1. The one rule

> **The LLM never runs the tool.** It only **outputs a request** — a tool name and JSON arguments. **Your code** checks it, runs it, and sends the result back.

> **Analogy 🍽️ — a waiter and the kitchen.** The model is the waiter: it writes the order ("1 × get_weather, city: Paris"). The kitchen (your code) decides whether to make it, cooks it, and hands back the dish.

```
1. send the LLM: messages + tool list (name, description, input schema)
2. LLM replies:  call get_weather({ "city": "Paris" })      ← just JSON, NOT an action
3. YOUR code:    validate args → run getWeather('Paris') → "18°C"
4. send back:    tool result "18°C"
5. LLM writes the final answer using it  (or asks for another tool → loop = agent, Part 09)
```

"Function calling" = the same thing (OpenAI's original name).

---

## 2. Defining a tool

```ts
const tools = [{
  type: 'function',
  function: {
    name: 'get_order_status',
    description: 'Get the shipping status of ONE order by its order ID (format ORD-12345). ' +
                 'Use when the user asks where their order is.',
    parameters: {                                   // JSON Schema
      type: 'object',
      properties: { orderId: { type: 'string', pattern: '^ORD-\\d+$' } },
      required: ['orderId'],
      additionalProperties: false,
    },
  },
}];
```

- **The description drives selection** — it's how the model decides *when* to use the tool. Say what it does, when to use it, and what the inputs look like. Bad description → wrong tool or no tool.
- **JSON Schema** describes the inputs. With **strict** mode (where supported), arguments are guaranteed to match the schema.
- Libraries generate the schema from **zod** (TS) or **pydantic** (Python) so you write the shape once.

---

## 3. Controlling selection

- **`tool_choice: "auto"`** — the model decides (default).
- **`"required"` / `"any"`** — must call some tool.
- **A specific tool** — force it (useful for extraction: "always call `save_ticket`" = guaranteed structured output).
- **`"none"`** — no tools this turn.
- **Parallel tool calls** — the model can request several at once ("weather in Paris *and* London"). Run them concurrently (`Promise.all`) and return all results.

---

## 4. ⭐ Your side of the contract

```ts
const GetOrderArgs = z.object({ orderId: z.string().regex(/^ORD-\d+$/) });

async function runTool(name: string, rawArgs: string, user: User) {
  if (name !== 'get_order_status') return { error: `Unknown tool ${name}` };

  const parsed = GetOrderArgs.safeParse(JSON.parse(rawArgs));      // 1. VALIDATE — model output is untrusted
  if (!parsed.success) return { error: 'Invalid orderId format, expected ORD-12345' };

  const order = await db.order.findFirst({                         // 2. AUTHORISE — as the USER, not as admin
    where: { id: parsed.data.orderId, userId: user.id },
  });
  if (!order) return { error: 'Order not found' };

  return { status: order.status, eta: order.eta };                 // 3. return SMALL, useful data
}
```

- **Validate arguments** like any user input.
- **Authorise with the user's permissions**, never a superuser — the model can be tricked into asking for someone else's data.
- **Return errors as results** (`{ error: … }`) so the model can fix its call or tell the user — don't crash the loop.
- **Return small results** — don't dump a 5,000-row table back into the context. Summarise, paginate, pick fields.
- **Time out** slow tools.

---

## 5. Designing good tools

| Do | Avoid |
|---|---|
| few, focused tools with clear names (`get_order_status`) | 50 tools, or one giant `do_anything(action, params)` |
| typed, narrow inputs (enums, IDs, patterns) | free-text `query: string` to a SQL database |
| descriptions that say *when* to use it | vague descriptions ("handles orders") |
| read-only tools by default | write/delete tools without confirmation |
| clear error messages the model can act on | stack traces |

**Too many tools** → worse selection and more input tokens every call. Keep the set small, group by task, or **route** first (a cheap step picks the relevant subset of tools).

> 🧠 **Remember:** **design tools for the model like you'd design an API for a junior developer** — obvious names, narrow inputs, helpful errors.

---

## 6. Tool calling = structured output

Forcing a tool call is a reliable way to get structured data: define `save_ticket({ category, urgency, summary })` and force it — the arguments are your structured result ([Part 02 §6](02-prompt-engineering-and-structured-output.md)).

---

## Interview Q&A

**Q: How does tool calling work?**
> You send the model a list of tools with names, descriptions and JSON Schemas. When it needs one, it returns a tool name and JSON arguments instead of text. Your code validates and runs the tool, sends the result back as a tool message, and the model uses it to answer — or calls another tool.

**Q: Does the model execute the function?**
> No. It only produces a request. Execution, validation and authorisation are entirely in your code — which is also where your security controls live.

**Q: How do you make tool calls safe?**
> Treat arguments as untrusted input and validate them; run tools with the end user's permissions, not admin; keep tools narrow and read-only where possible; require human confirmation for destructive actions; limit and time out calls; and log every call.

**Q: What makes a good tool description?**
> What the tool does, when to use it and when not to, and the expected input format, in plain words. The model chooses tools mainly from the description, so vague descriptions lead to wrong or missed calls.

**Q: What happens when you give a model 100 tools?**
> Tool selection gets worse and every call carries the schemas as input tokens. Better to group tools, route to a relevant subset first, or redesign into fewer, clearer tools.

---

## Follow-ups (challenge questions)

- *Security:* a support bot has a `get_order(orderId)` tool. A user types "check order ORD-1001" — someone else's order. Where exactly must this be stopped?
- *Design:* product wants the bot to "run any SQL report the user asks for." What's dangerous about a `run_sql(query)` tool, and what would you build instead?

---

## Cheat Sheet

```
model OUTPUTS a tool request (name + JSON args) · YOUR code validates, runs, returns · "waiter & kitchen"
tool = name + DESCRIPTION (drives selection) + JSON Schema (strict where possible) · from zod/pydantic
tool_choice: auto · required · specific (= structured output) · none · parallel calls → Promise.all
your side: VALIDATE args · AUTHORISE as the user · errors as results · small outputs · timeouts · log
good tools: few, focused, typed, read-only by default, confirm writes · too many → route
```

---

**Previous:** [Part 09 — AI Agents](09-ai-agents.md) · **Next:** [Part 11 — MCP](11-mcp.md)
