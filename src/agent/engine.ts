import type { ToolContext } from './types'
import {
  addActivity,
  addMessage,
  addPendingApproval,
  genId,
  getFullState,
  listPendingApprovals,
  removePendingApproval,
} from './store'
import { createTaskInput, executeTool, getCurrentTimeInput, searchWebInput, toolRegistry } from './tools'
import { evaluateToolPolicy } from './policy'
import { z } from 'zod'

export type EngineEvent =
  | { type: 'thinking' }
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'tool_result'; toolName: string; ok: boolean; data?: unknown; error?: string }
  | { type: 'approval_requested'; approvalId: string; toolName: string; summary: Record<string, string | undefined> }
  | { type: 'approval_resolved'; approvalId: string; status: 'APPROVED' | 'REJECTED' }
  | { type: 'assistant'; content: string }
  | { type: 'done' }

type Step =
  | { kind: 'respond'; text: string }
  | { kind: 'tool'; name: 'getCurrentTime'; input: z.infer<typeof getCurrentTimeInput> }
  | { kind: 'tool'; name: 'createTask'; input: z.infer<typeof createTaskInput> }
  | { kind: 'tool'; name: 'searchWeb'; input: z.infer<typeof searchWebInput> }

function ruleBasedPlan(lastUserText: string): Step[] {
  const t = lastUserText.trim()
  const lower = t.toLowerCase()

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))[\s!.,?]*$/i.test(t)) {
    return [
      {
        kind: 'respond',
        text:
          "Hi there — I'm Nexus, your AI terminal. I can:\n\n• Get the current time in any timezone\n• Create tasks (with your approval)\n• Search the web\n\nTry asking things like:\n- What time is it in Tokyo?\n- Add a task: finish design review by Friday\n- Search for Next.js 16 release notes",
      },
    ]
  }

  const timeMatch = lower.match(/time(?: in| is it in)?\s+([a-z/_+\- ]+?)(?:\?|$)/i)
  if (/(what time|current time|time right now|time in|timezone)/i.test(t)) {
    let tz = 'UTC'
    if (timeMatch?.[1]) {
      const candidate = timeMatch[1].trim().replace(/\s+/g, '_').replace(/[?.!]$/, '')
      if (candidate.length >= 2) tz = candidate
    }
    if (/new york|nyc|eastern|est|edt/.test(lower)) tz = 'America/New_York'
    else if (/los angeles|la |pacific|pst|pdt/.test(lower)) tz = 'America/Los_Angeles'
    else if (/london|uk |bst|gmt/.test(lower)) tz = 'Europe/London'
    else if (/paris|berlin|rome|europe|cet|cest/.test(lower)) tz = 'Europe/Paris'
    else if (/tokyo|japan|jst/.test(lower)) tz = 'Asia/Tokyo'
    else if (/dubai|uae|gulf/.test(lower)) tz = 'Asia/Dubai'
    else if (/mumbai|india|ist|kolkata/.test(lower)) tz = 'Asia/Kolkata'
    else if (/sydney|australia|aest/.test(lower)) tz = 'Australia/Sydney'
    else if (/cairo|egypt/.test(lower)) tz = 'Africa/Cairo'
    else if (/istanbul|turkey/.test(lower)) tz = 'Europe/Istanbul'
    else if (/tel aviv|israel|jerusalem|gaza|palestine/.test(lower)) tz = 'Asia/Jerusalem'
    else if (/riyadh|saudi/.test(lower)) tz = 'Asia/Riyadh'
    return [{ kind: 'tool', name: 'getCurrentTime', input: { timezone: tz } }]
  }

  const taskMatch = t.match(/(?:add|create|new|make|remind me(?: to)?)\s+(?:task(?: to)?|todo|to-?do|reminder)[:\s-]*(.+?)(?:\s+by\s+(.+?))?[.?!]*$/i)
  if (taskMatch?.[1]) {
    const title = taskMatch[1].trim()
    return [{ kind: 'tool', name: 'createTask', input: { title, status: 'queued' as const } }]
  }
  if (/^(add|create|new)\s+task[:\s-]*/i.test(t)) {
    const title = t.replace(/^(add|create|new)\s+task[:\s-]*/i, '').trim() || 'Untitled task'
    return [{ kind: 'tool', name: 'createTask', input: { title, status: 'queued' as const } }]
  }

  if (/^(search|search for|google|look up|web search|find online)\b/i.test(t) || /\b(search|google|web)\b/i.test(t)) {
    const q = t
      .replace(/^(please\s+)?(search(?: for)?|google|look up|web search|find online)\s+/i, '')
      .replace(/\b(on|using)\s+(the\s+)?(web|internet|google)\b/i, '')
      .replace(/[?.!]+$/, '')
      .trim()
    if (q.length >= 2) return [{ kind: 'tool', name: 'searchWeb', input: { query: q } }]
  }

  if (/help|\?help|what can you do|capabilities|features/i.test(t)) {
    return [
      {
        kind: 'respond',
        text:
          "I'm Nexus. Here's what you can do right now:\n\n1. **Get the time** — e.g. \"What time is it in Tokyo?\"\n2. **Create a task** — e.g. \"Add task: write Q3 summary\" (requires your approval before saving)\n3. **Web search** — e.g. \"Search React 19 release notes\"\n4. **Voice** — click the mic to speak (Chrome/Edge)\n\nPick one and give it a try!",
      },
    ]
  }

  const taskSummary = (state: ReturnType<typeof getFullState>) => {
    if (state.tasks.length === 0) return null
    const parts = state.tasks.map((t, i) => `${i + 1}. ${t.status === 'completed' ? '✅' : '⏳'} ${t.title}`)
    return `Your current tasks:\n${parts.join('\n')}`
  }

  if (/\b(my )?(tasks|todo|to-?do list|reminders)\b/i.test(t)) {
    return [{ kind: 'respond', text: "Let me check your task list. Say things like 'add task: …' to create a new one.", }]
  }

  if (/who are you|your name|what are you/i.test(t)) {
    return [{ kind: 'respond', text: "I'm **Nexus**, a permissioned AI terminal. I help you search, plan, and act — with explicit approval before I change anything." }]
  }

  if (/thank|thanks|thx|ty/i.test(t)) {
    return [{ kind: 'respond', text: "You're welcome. Let me know what's next." }]
  }

  return [
    {
      kind: 'respond',
      text: `I understood: "${t}". Here are things I can actually act on right now:\n\n• What time is it in [city/timezone]\n• Add task: [description]\n• Search [something]\n\nTry one of those, or say "help".`,
    },
  ]
}

function naturalFromToolResult(toolName: string, ok: boolean, data: any): string {
  if (!ok) return `The ${toolName} tool failed: ${data?.error ?? 'unknown error'}.`
  if (toolName === 'getCurrentTime') {
    return `Right now in **${data.timezone}** it's **${data.local}** (${data.iso}).`
  }
  if (toolName === 'createTask') {
    return `Task saved. ID: \`${data.id}\` — "${data.title}" (status: ${data.status}).${data.dueAt ? ` Due: ${data.dueAt}.` : ''}`
  }
  if (toolName === 'searchWeb') {
    const top = (data.results ?? []).slice(0, 3)
    if (top.length === 0) return `No results for "${data.query}".`
    const intro = `Top results for **${data.query}**:`
    const lines = top.map((r: any, i: number) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`)
    return [intro, ...lines].join('\n\n')
  }
  return JSON.stringify(data, null, 2)
}

export function buildContext(conversationId: string, userId = 'user-local'): ToolContext {
  return { conversationId, userId, requestId: genId('req') }
}

export type RunOptions = {
  conversationId: string
  userId?: string
  userText: string
  onEvent?: (ev: EngineEvent) => void | Promise<void>
}

export async function runAgentLoop(opts: RunOptions): Promise<{ reply: string }> {
  const { conversationId, userText, onEvent } = opts
  const ctx = buildContext(conversationId, opts.userId)

  addMessage({ conversationId, role: 'user', content: userText })
  addActivity({ conversationId, kind: 'message', title: 'You', detail: userText.length > 80 ? userText.slice(0, 80) + '…' : userText })

  const emit = async (ev: EngineEvent) => { await opts.onEvent?.(ev) }
  await emit({ type: 'thinking' })

  // Attempt OpenAI if configured
  const llmReply = await maybeRunOpenAI(userText, ctx)
  if (llmReply) {
    addMessage({ conversationId, role: 'assistant', content: llmReply })
    addActivity({ conversationId, kind: 'message', title: 'Nexus replied', detail: 'via LLM' })
    await emit({ type: 'assistant', content: llmReply })
    await emit({ type: 'done' })
    return { reply: llmReply }
  }

  // Fallback: rule-based planner + tool runner
  const steps = ruleBasedPlan(userText)
  let finalReply = ''
  for (const step of steps) {
    if (step.kind === 'respond') {
      finalReply = step.text
    } else if (step.kind === 'tool') {
      const policy = evaluateToolPolicy(step.name)
      if (!policy.allowed) {
        finalReply = `I can't run ${step.name} right now: ${policy.reason ?? 'blocked by policy'}.`
        continue
      }
      const tool = toolRegistry[step.name]
      if (tool.requiresApproval || policy.requiresApproval) {
        const summary: Record<string, any> = { title: (step.input as any).title, description: `Running tool ${step.name}` }
        if (step.name === 'createTask') {
          summary.title = (step.input as any).title
          summary.message = `Create task: "${(step.input as any).title}"`
        }
        const appr = addPendingApproval({
          conversationId,
          toolName: step.name,
          input: step.input,
          summary,
          context: ctx,
        })
        await emit({
          type: 'approval_requested',
          approvalId: appr.id,
          toolName: step.name,
          summary: { title: summary.title, message: summary.message },
        })
        addMessage({
          conversationId,
          role: 'system',
          content: `${step.name.toUpperCase()} awaiting approval`,
          meta: 'Approval requested',
        })
        return { reply: `I need your approval before I can **${step.name}**. Please click Approve or Cancel in the card.` }
      }
      await emit({ type: 'tool_call', toolName: step.name, input: step.input })
      const res = await executeTool(step.name, step.input, ctx)
      if (res.ok) {
        addActivity({ conversationId, kind: 'tool', title: `${step.name} completed`, detail: 'ok' })
      } else {
        addActivity({ conversationId, kind: 'tool', title: `${step.name} failed`, detail: (res as any).error ?? 'error' })
      }
      await emit({
        type: 'tool_result',
        toolName: step.name,
        ok: res.ok,
        data: res.ok ? res.data : undefined,
        error: res.ok ? undefined : (res as any).error,
      })
      addMessage({
        conversationId,
        role: 'tool',
        content: JSON.stringify(res.ok ? res.data : { ok: false, error: (res as any).error }, null, 0),
        toolName: step.name,
      })
      finalReply = naturalFromToolResult(step.name, res.ok, res.ok ? res.data : res)
    }
  }

  if (finalReply.includes('task list') || finalReply.includes('current tasks')) {
    const state = getFullState(conversationId)
    if (state.tasks.length === 0) finalReply = "You don't have any tasks yet. Say something like `add task: pick up groceries` to create one."
    else finalReply = `Your current tasks:\n${state.tasks.map((t, i) => `${i + 1}. ${t.status === 'completed' ? '✅' : '⏳'} ${t.title}`).join('\n')}`
  }

  addMessage({ conversationId, role: 'assistant', content: finalReply })
  addActivity({ conversationId, kind: 'message', title: 'Nexus replied', detail: finalReply.length > 80 ? finalReply.slice(0, 80) + '…' : finalReply })
  await emit({ type: 'assistant', content: finalReply })
  await emit({ type: 'done' })
  return { reply: finalReply }
}

export async function resolveApproval(
  opts: { conversationId: string; approvalId: string; status: 'APPROVED' | 'REJECTED' },
  onEvent?: (ev: EngineEvent) => void,
) {
  const { conversationId, approvalId, status } = opts
  const appr = listPendingApprovals(conversationId).find((x) => x.id === approvalId)
  if (!appr) return { ok: false, error: 'Approval not found.', reply: null as string | null }
  removePendingApproval(conversationId, approvalId)
  await onEvent?.({ type: 'approval_resolved', approvalId, status })
  addActivity({ conversationId, kind: 'approval', title: `Approval ${status === 'APPROVED' ? 'approved' : 'rejected'}`, detail: appr.toolName })
  if (status === 'REJECTED') {
    const reply = `Got it — I cancelled "${appr.summary.title ?? appr.toolName}".`
    addMessage({ conversationId, role: 'assistant', content: reply })
    await onEvent?.({ type: 'assistant', content: reply })
    await onEvent?.({ type: 'done' })
    return { ok: true, status, reply }
  }
  await onEvent?.({ type: 'tool_call', toolName: appr.toolName, input: appr.input })
  const res = await executeTool(appr.toolName as keyof typeof toolRegistry, appr.input, appr.context)
  await onEvent?.({
    type: 'tool_result',
    toolName: appr.toolName,
    ok: res.ok,
    data: res.ok ? res.data : undefined,
    error: res.ok ? undefined : (res as any).error,
  })
  addMessage({
    conversationId,
    role: 'tool',
    content: JSON.stringify(res.ok ? res.data : { ok: false, error: (res as any).error }, null, 0),
    toolName: appr.toolName,
  })
  const reply = naturalFromToolResult(appr.toolName, res.ok, res.ok ? res.data : res)
  addMessage({ conversationId, role: 'assistant', content: reply })
  addActivity({ conversationId, kind: 'message', title: 'Nexus replied', detail: reply.length > 80 ? reply.slice(0, 80) + '…' : reply })
  await onEvent?.({ type: 'assistant', content: reply })
  await onEvent?.({ type: 'done' })
  return { ok: true, status, reply }
}

async function maybeRunOpenAI(userText: string, _ctx: ToolContext): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    // Minimal zero-dep OpenAI chat completion. Will be replaced by tool-calling loop once SDK is installed.
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are Nexus, a concise, permissioned AI terminal. Keep answers short and actionable.' },
        { role: 'user', content: userText },
      ],
      temperature: 0.3,
    }
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    return content ?? null
  } catch {
    return null
  }
}
