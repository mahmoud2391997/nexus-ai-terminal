export type ToolContext = { userId: string; conversationId: string; requestId: string }

export type EngineEvent =
  | { type: 'thinking' }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'tool_result'; toolName: string; ok: boolean; data?: unknown; error?: string }
  | {
      type: 'approval_requested'
      approvalId: string
      toolName: string
      summary: Record<string, string | undefined>
    }
  | { type: 'approval_resolved'; approvalId: string; status: 'APPROVED' | 'REJECTED' }
  | { type: 'assistant'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type ToolStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string }
export type ToolDefinition<I, O> = { name: string; description: string; requiresApproval?: boolean; execute: (input: I, context: ToolContext) => Promise<ToolResult<O>> }
