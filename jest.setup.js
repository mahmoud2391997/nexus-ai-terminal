import '@testing-library/jest-dom'

// Environment variables used across unit tests.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.AUTH_SECRET = 'test-secret-for-testing'
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.NODE_ENV = 'test'

const taskRow = (overrides = {}) => ({
  id: 'task-1',
  userId: 'test-user-id',
  conversationId: 'test-conv-id',
  title: 'Test task',
  status: 'queued',
  dueAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const conversationRow = (overrides = {}) => ({
  id: 'test-conv-id',
  userId: 'test-user-id',
  title: 'New conversation',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const approvalRow = (overrides = {}) => ({
  id: 'appr-1',
  userId: 'test-user-id',
  actionType: 'createTask',
  payload: { title: 'Test task' },
  status: 'PENDING',
  conversationId: 'test-conv-id',
  expiresAt: new Date(Date.now() + 60000),
  createdAt: new Date(),
  approvedAt: null,
  rejectedAt: null,
  ...overrides,
})

const messageRow = (overrides = {}) => ({
  id: 'msg-1',
  conversationId: 'test-conv-id',
  role: 'user',
  content: 'hello',
  toolCalls: null,
  createdAt: new Date(),
  ...overrides,
})

// Mock Prisma with in-memory behavior for the surfaces the tools/store exercise.
jest.mock('@/src/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    conversation: {
      findUnique: jest.fn(() => Promise.resolve(conversationRow())),
      create: jest.fn(({ data }) => Promise.resolve(conversationRow(data))),
      findMany: jest.fn(() => Promise.resolve([conversationRow()])),
    },
    task: {
      findMany: jest.fn(() => Promise.resolve([taskRow()])),
      create: jest.fn(({ data }) => Promise.resolve(taskRow(data))),
      update: jest.fn(({ data }) => Promise.resolve(taskRow(data))),
      findUnique: jest.fn(() => Promise.resolve(taskRow())),
    },
    message: {
      findMany: jest.fn(() => Promise.resolve([messageRow()])),
      create: jest.fn(({ data }) => Promise.resolve(messageRow(data))),
    },
    approvalRequest: {
      findMany: jest.fn(() => Promise.resolve([approvalRow()])),
      create: jest.fn(({ data }) => Promise.resolve(approvalRow(data))),
      update: jest.fn(() => Promise.resolve(approvalRow())),
      findUnique: jest.fn(({ where }) => Promise.resolve(where?.id ? approvalRow({ id: where.id }) : approvalRow())),
    },
    toolExecution: {
      create: jest.fn(({ data }) => Promise.resolve({ ...data, id: 'exec-1', output: null, completedAt: null, startedAt: null, error: null })),
      findUnique: jest.fn(() => Promise.resolve(null)),
      update: jest.fn(({ data }) => Promise.resolve(data)),
      findFirst: jest.fn(() => Promise.resolve(null)),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({})) },
    oAuthConnection: { findMany: jest.fn(() => Promise.resolve([])) },
  },
}))

// Mock NextAuth
jest.mock('@/src/lib/auth', () => ({
  auth: jest.fn(() => ({ user: { id: 'test-user-id', email: 'test@example.com' } })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  handlers: { GET: jest.fn(), POST: jest.fn() },
}))

// Suppress console output in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}