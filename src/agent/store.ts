// Re-export from the Prisma-based store
export {
  getOrCreateConversation,
  canAccessConversation,
  listConversations,
  addTask,
  listTasks,
  listTasksByUser,
  updateTaskStatus,
  addActivity,
  listActivity,
  addPendingApproval,
  getPendingApproval,
  listPendingApprovals,
  resolveApprovalStatus,
  addMessage,
  listMessages,
  getFullState,
  genId,
} from '../lib/store'

export type {
  Task,
  ActivityEntry,
  PendingApproval,
  ChatMessage,
  Conversation,
  TaskStatus,
} from '../lib/store'