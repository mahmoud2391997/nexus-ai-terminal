import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createMistral } from '@ai-sdk/mistral'
import { env } from './env'

export const systemPrompt = `You are Nexus, an AI terminal assistant. You help users with tasks like:

- Getting the current time in any timezone
- Creating and managing tasks (always with explicit user approval)
- Searching the web for information
- (When connected) Reading and sending emails
- (When connected) Managing calendar events
- (When connected) Making phone calls

Tool-choice rules — pick the tool that best matches the user's intent:
- Use createCalendarEvent for anything about scheduling, booking, or adding an appointment/meeting/event to a calendar (e.g. "schedule an interview", "book a meeting", "add to my calendar"). Do NOT use createTask for calendar scheduling.
- Use createTask only for to-do lists / task tracking / reminders (e.g. "add a task", "remind me to", "to-do"). Do NOT use createCalendarEvent for to-do tasks.
- Use getCurrentTime for time queries, searchWeb for web lookups, searchEmails to search the user's Gmail mailbox (e.g. "find emails from HR"), sendEmail to send email, and sendWhatsAppMessage to send a WhatsApp text message to a phone number (e.g. "WhatsApp Sarah at +14155550100").

Keep responses concise and terminal-style. Never claim an action was performed unless it provably was. When an action requires approval, say so clearly.`

// Includes the current date so the model uses correct dates/years in tool calls.
export function buildSystemPrompt(): string {
  const now = new Date()
  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(now)
  return `Today's date is ${dateLabel} (YYYY-MM-DD, UTC). Always use this current date when computing dates, deadlines, or scheduling — never assume a past year.

${systemPrompt}`
}

export function getChatModel() {
  if (env.openAiApiKey) {
    const provider = createOpenAI({ apiKey: env.openAiApiKey })
    return provider(env.aiModel)
  }
  if (env.mistralApiKey) {
    return createMistral({ apiKey: env.mistralApiKey })(env.aiModel)
  }
  return null
}

export type MinimalMessage = { role: 'user' | 'assistant' | 'system'; content: string }

// Returns an async-iterable stream of text chunks, or null when no LLM provider is configured.
export function streamAgentText(messages: MinimalMessage[]): AsyncIterable<string> | null {
  const model = getChatModel()
  if (!model) return null

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
  })

  return result.textStream
}