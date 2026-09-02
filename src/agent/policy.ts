import type { ToolStatus } from './types'

export type PolicyDecision = { allowed: boolean; requiresApproval: boolean; reason?: string; riskLevel?: 'SAFE' | 'CONFIRMATION_REQUIRED' | 'HIGH_RISK' }

// Tool categorization by risk level
const SAFE_TOOLS = new Set([
  'getCurrentTime',
  'searchWeb',
  'searchEmails',
  'readEmail',
  'summarizeEmails',
  'searchCalendar',
  'readCalendar',
])

const CONFIRMATION_REQUIRED_TOOLS = new Set([
  'createTask',
  'sendEmail',
  'sendWhatsAppMessage',
  'draftEmail',
  'createCalendarEvent',
  'updateCalendarEvent',
  'cancelCalendarEvent',
  'initiatePhoneCall',
  'scheduleAutomation',
])

const HIGH_RISK_TOOLS = new Set([
  'confirmOrder',
  'spendMoney',
  'deleteData',
  'cancelAppointment',
  'broadcastMessage',
  'deleteEmail',
  'deleteCalendarEvent',
])

export function evaluateToolPolicy(toolName: string, status: ToolStatus = 'PENDING'): PolicyDecision {
  if (status !== 'PENDING' && status !== 'RUNNING') {
    return { 
      allowed: false, 
      requiresApproval: false, 
      reason: 'Tool execution is not in a runnable state.' 
    }
  }

  // Determine risk level
  let riskLevel: 'SAFE' | 'CONFIRMATION_REQUIRED' | 'HIGH_RISK'
  let requiresApproval = false
  let reason: string | undefined

  if (HIGH_RISK_TOOLS.has(toolName)) {
    riskLevel = 'HIGH_RISK'
    requiresApproval = true
    reason = 'This action is high risk and requires explicit approval. It cannot be auto-approved and requires re-confirmation if the payload changes.'
  } else if (CONFIRMATION_REQUIRED_TOOLS.has(toolName)) {
    riskLevel = 'CONFIRMATION_REQUIRED'
    requiresApproval = true
    reason = 'This action changes external state and requires your approval before execution.'
  } else if (SAFE_TOOLS.has(toolName)) {
    riskLevel = 'SAFE'
    requiresApproval = false
    reason = undefined
  } else {
    // Default to confirmation required for unknown tools
    riskLevel = 'CONFIRMATION_REQUIRED'
    requiresApproval = true
    reason = 'This tool requires approval before execution.'
  }

  return {
    allowed: true,
    requiresApproval,
    reason,
    riskLevel,
  }
}

export function isOwnedResource(resourceUserId: string, contextUserId: string) {
  return Boolean(resourceUserId) && resourceUserId === contextUserId
}

export type ActionPolicyInput = {
  userId: string
  toolName: string
  input?: unknown
  riskLevel?: 'SAFE' | 'CONFIRMATION_REQUIRED' | 'HIGH_RISK'
}

export type ActionPolicyResult = {
  allowed: boolean
  requiresApproval: boolean
  reason?: string
  riskLevel?: 'SAFE' | 'CONFIRMATION_REQUIRED' | 'HIGH_RISK'
}

// §14: the policy engine — not the model — is the sole authority on approval gating.
export function evaluateActionPolicy({
  userId,
  toolName,
  riskLevel: forcedRiskLevel,
}: ActionPolicyInput): ActionPolicyResult {
  const decision = evaluateToolPolicy(toolName)

  // The engine must always operate for an authenticated user.
  if (!userId || userId.length === 0) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'An authenticated user is required to evaluate an action policy.',
      riskLevel: forcedRiskLevel ?? decision.riskLevel,
    }
  }

  return {
    allowed: decision.allowed,
    requiresApproval: decision.requiresApproval,
    reason: decision.reason,
    riskLevel: forcedRiskLevel ?? decision.riskLevel,
  }
}

// Check if a tool is high risk (cannot be auto-approved)
export function isHighRiskTool(toolName: string): boolean {
  return HIGH_RISK_TOOLS.has(toolName)
}

// Check if payload changes require re-approval (for HIGH_RISK tools)
export function requiresReApproval(toolName: string, oldPayload: unknown, newPayload: unknown): boolean {
  if (!isHighRiskTool(toolName)) return false
  return JSON.stringify(oldPayload) !== JSON.stringify(newPayload)
}
