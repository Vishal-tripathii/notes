# AI Engineering Notes — Part 09

## AI Agents ⭐⭐⭐⭐⭐

**Topics:** LLM vs workflow vs agent · the agent loop · reasoning, planning, acting · scratchpad & context management · ReAct · plan-and-execute · reflection · CoT, self-consistency, tree of thoughts · agentic RAG · stopping conditions & guardrails · a minimal agent without a framework · frameworks (LangGraph, LangChain, SDKs).

---

## 1. The one rule

> **An agent is an LLM in a loop** that can **reason**, **call tools**, **observe the results** and **decide its own next step** — until the goal is met. RAG runs on rails you laid; an agent **lays its own track.**

> **Analogy 🧠 — a brain in a jar vs a brain with hands and eyes.** A plain LLM can only think and talk. Give it tools and a loop, and it can *do* things and choose what to do next.

---

## 2. LLM call vs workflow vs agent

| | Single LLM call | **Workflow** (chain) | **Agent** |
|---|---|---|---|
| control flow | — | **fixed by your code** | **decided by the LLM at runtime** |
| steps | one | fixed pipeline | loops until done |
| predictability | high | high | lower |
| cost / latency | low | medium | higher, variable |

> 🧠 **Remember:** **use the simplest one that works.** Many "agents" in production are really workflows — fixed steps with an LLM in some of them — and that's a good thing. Reach for an agent when the steps genuinely can't be known in advance.

*One-liner:* "An LLM predicts text; an agent uses the LLM as a reasoning engine in a loop that takes actions and adapts — the LLM decides the control flow."

---

## 3. Architecture — 4 pieces

1. **Model** (brain) — reasons and decides the next action.
2. **Tools** (hands) — search, database, APIs, code, email ([Part 10](10-tool-calling.md)).
3. **Memory** (notebook) — within the task and across sessions ([Part 13](13-memory-and-multi-agent.md)).
4. **Loop / orchestration** (your code) — call model → run tool → feed result back → repeat → stop.

```
GOAL → MODEL decides → call TOOL → OBSERVE result → back to MODEL … → ANSWER
```

Inside each turn: **reason** (what's needed?) → **plan** (which step next?) → **act** (call a tool) → **observe** (read the result).

---

## 4. Components that matter

- **Scratchpad** — the running log of thoughts, tool calls and results, fed back each turn = short-term memory.
- ⭐ **Context management** — the scratchpad **grows every step** → overflows the window, gets slow, costly and "lost in the middle." Trim old tool outputs, summarise, keep only what's needed. *Gold:* "The hardest part of agents isn't reasoning — it's managing context as the history grows."
- **Reflection / self-critique** — check its own work and revise → better reliability at more cost.
- ⭐ **Stopping conditions** — **max steps**, **max cost/tokens**, **timeout**, and "no progress" detection. Without them an agent can loop forever and burn money.
- **Human-in-the-loop** — require approval before risky actions (sending email, paying, deleting) ([Part 15](15-ai-security.md)).

---

## 5. Patterns

- **ReAct** ⭐⭐ (the default) — interleave **Thought → Action → Observation**, looped. Think before each tool call, observe after, adapt. Modern tool-calling APIs do this naturally: the model returns tool calls, you return results, repeat.
- **Plan-and-execute** — plan all steps first, then run them. Efficient and easy to show the user, but brittle if a step fails → usually re-plan on failure.
- **Reflection** — draft → critique → revise. Quality up, cost up.
- **Chain of thought (CoT)** — "think step by step." The base of all the above; reasoning models do it internally.
- **Self-consistency** — run the reasoning N times, take the majority answer. Cost for reliability.
- **Tree of thoughts** — explore several reasoning branches, prune bad ones. Powerful, expensive, rarely needed in apps.

**Agentic RAG** — RAG becomes one tool; the agent decides whether and how to retrieve ([Part 08 §5](08-advanced-rag.md)).

---

## 6. ⭐ A minimal agent — no framework

Writing the loop yourself once shows there's no magic:

```python
# pip install openai
import json, os
from openai import OpenAI
client = OpenAI(); MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

def word_length(word: str) -> int:
    return len(word)

def multiply(a: float, b: float) -> float:          # a safe, narrow tool — NOT eval()
    return a * b

TOOLS = {"word_length": word_length, "multiply": multiply}
tool_specs = [
    {"type": "function", "function": {
        "name": "word_length", "description": "Count the letters in a single word.",
        "parameters": {"type": "object", "properties": {"word": {"type": "string"}},
                       "required": ["word"]}}},
    {"type": "function", "function": {
        "name": "multiply", "description": "Multiply two numbers.",
        "parameters": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
                       "required": ["a", "b"]}}},
]

messages = [{"role": "user", "content": "How many letters in 'refrigerator', times 3?"}]

for step in range(5):                                         # STOP CONDITION: max steps
    msg = client.chat.completions.create(model=MODEL, messages=messages, tools=tool_specs).choices[0].message
    if not msg.tool_calls:                                    # no tool call → final answer
        print(msg.content); break
    messages.append(msg)
    for call in msg.tool_calls:                               # the model ASKS, our code RUNS
        args = json.loads(call.function.arguments)
        result = TOOLS[call.function.name](**args)
        print(f"step {step}: {call.function.name}({args}) -> {result}")
        messages.append({"role": "tool", "tool_call_id": call.id, "content": str(result)})
else:
    print("Stopped: too many steps")
```

⚠️ The old version of these notes used a `calculator` tool that ran `eval()` on model-written text — **never do that**: anything that reaches the model (including a document it read) could make it run arbitrary code. Give tools **narrow, typed inputs**.

---

## 7. Frameworks — when to use one

| Option | What it is |
|---|---|
| **No framework** (SDK + loop above) | full control, easiest to debug — fine for most apps |
| **LangGraph** | agents as a graph of steps with state, checkpoints, human approval, retries — for complex, long-running flows |
| **LangChain 1.x** | `create_agent(model, tools, system_prompt)` on top of LangGraph (the older `AgentExecutor` / `create_react_agent` APIs are legacy) |
| **Provider SDKs** | OpenAI Agents SDK, Claude Agent SDK, Google ADK — agent loop, tools, handoffs, tracing built in |
| **Vercel AI SDK** (TS) | tool calling + multi-step loops + streaming to React ([Part 12](12-llm-apps-in-node-and-react.md)) |

```python
# LangChain 1.x equivalent of the loop above
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def word_length(word: str) -> int:
    """Count the letters in a single word."""
    return len(word)

agent = create_agent(model="openai:gpt-4o-mini", tools=[word_length])
result = agent.invoke({"messages": [{"role": "user", "content": "Letters in 'refrigerator'?"}]})
print(result["messages"][-1].content)
```

> 🧠 **Remember:** **learn the loop raw, use a framework when you need its features** (state persistence, approvals, tracing) — not by default.

---

## Interview Q&A

**Q: What's the difference between an agent and a workflow?**
> In a workflow, my code decides the steps and the LLM fills in some of them. In an agent, the LLM decides at runtime which tool to call next and when it's done. Workflows are more predictable and cheaper; I use an agent only when the steps can't be known in advance.

**Q: Explain ReAct.**
> Reason and Act: the model alternates between thinking about what to do, taking an action with a tool, and observing the result, looping until it can answer. Each observation informs the next thought, so it can adapt.

**Q: What are the main risks with agents in production?**
> Loops and runaway cost, so you need step, token and time limits; growing context, so you manage it; unpredictable behaviour that's hard to test; and safety — an agent with powerful tools can be manipulated by prompt injection, so tools need least privilege and risky actions need human approval.

**Q: Why is context management hard for agents?**
> Every step adds the model's reasoning and tool outputs to the history. It grows quickly, raising cost and latency and burying important details. You trim large tool outputs, summarise older steps, and keep only the information the next step needs.

**Q: Would you use a framework like LangChain?**
> For a simple agent, the SDK and a short loop are clearer and easier to debug. I'd use something like LangGraph when I need persistence, resumable long-running flows, human approval steps or built-in tracing.

---

## Follow-ups (challenge questions)

- *Failure mode:* an agent keeps calling `search_orders` with the same arguments 40 times and the bill spikes. What limits and checks should have existed?
- *Design:* "an agent that handles refund requests end to end." Which steps should be fixed workflow code, which need the LLM, and where must a human approve?

---

## Cheat Sheet

```
agent = LLM in a LOOP: reason → act (tool) → observe → repeat → stop
single call < WORKFLOW (code decides steps) < AGENT (LLM decides) — use the simplest that works
pieces: model · tools · memory · loop (your code)
context management ⭐ (trim tool output, summarise) · STOP: max steps, tokens, time, no progress
human approval for risky actions · narrow typed tools — NEVER eval()
patterns: ReAct ⭐ · plan-and-execute · reflection · CoT · self-consistency · tree of thoughts
frameworks: raw loop (default) · LangGraph (state, approvals) · LangChain create_agent · provider SDKs · Vercel AI SDK
```

---

**Previous:** [Part 08 — Advanced RAG](08-advanced-rag.md) · **Next:** [Part 10 — Tool Calling](10-tool-calling.md)
