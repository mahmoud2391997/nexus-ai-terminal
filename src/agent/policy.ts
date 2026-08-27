import type { ToolStatus } from './types'

export type PolicyDecision = { allowed: boolean; requiresApproval: boolean; reason?: string }

const approvalTools = new Set(['sendEmail', 'createCalendarEvent', 'sendTelegramMessage', 'initiatePhoneCall'])

export function evaluateToolPolicy(toolName: string, status: ToolStatus = 'PENDING'): PolicyDecision {
  if (status !== 'PENDING' && status !== 'RUNNING') return { allowed: false, requiresApproval: false, reason: 'Tool execution is not in a runnable state.' }
  return { allowed: true, requiresApproval: approvalTools.has(toolName), ...(approvalTools.has(toolName) ? { reason: 'This action changes external state.' } : {}) }
}

export function isOwnedResource(resourceUserId: string, contextUserId: string) {
  return Boolean(resourceUserId) && resourceUserId === contextUserId
}
