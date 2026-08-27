export type ToolContext = { userId: string; conversationId: string; requestId: string }
export type ToolStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string }
export type ToolDefinition<I, O> = { name: string; description: string; requiresApproval?: boolean; execute: (input: I, context: ToolContext) => Promise<ToolResult<O>> }
