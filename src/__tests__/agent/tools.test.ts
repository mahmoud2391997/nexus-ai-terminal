import { getCurrentTime, createTask, searchWeb, getCurrentTimeInput, createTaskInput, searchWebInput } from '../../agent/tools'

const mockContext = {
  userId: 'test-user-id',
  conversationId: 'test-conv-id',
  requestId: 'test-req-id',
}

describe('Agent Tools', () => {
  describe('getCurrentTime', () => {
    it('should return current time for valid timezone', async () => {
      const result = await getCurrentTime.execute({ timezone: 'UTC' }, mockContext)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toHaveProperty('iso')
        expect(result.data).toHaveProperty('timezone', 'UTC')
        expect(result.data).toHaveProperty('local')
        expect(result.data).toHaveProperty('unix')
        expect(typeof result.data.unix).toBe('number')
      }
    })

    it('should handle common timezone aliases', async () => {
      const result = await getCurrentTime.execute({ timezone: 'America/New_York' }, mockContext)
      expect(result.ok).toBe(true)
    })

    it('should return error for invalid timezone', async () => {
      const result = await getCurrentTime.execute({ timezone: 'Invalid/Timezone' }, mockContext)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_TIMEZONE')
        expect(result.error).toContain('Unknown or invalid timezone')
      }
    })

    it('should validate input schema', () => {
      const validInput = { timezone: 'UTC' }
      expect(() => getCurrentTimeInput.parse(validInput)).not.toThrow()
      
      const invalidInput = { timezone: '' }
      expect(() => getCurrentTimeInput.parse(invalidInput)).toThrow()
    })
  })

  describe('createTask', () => {
    it('should create a task with valid input', async () => {
      const result = await createTask.execute(
        { title: 'Test task', status: 'queued' },
        mockContext
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toHaveProperty('id')
        expect(result.data).toHaveProperty('status')
      }
    })

    it('should require user authentication', async () => {
      const result = await createTask.execute(
        { title: 'Test task', status: 'queued' },
        { userId: '', conversationId: 'test', requestId: 'test' }
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('UNAUTHENTICATED')
      }
    })

    it('should validate input schema', () => {
      const validInput = { title: 'Test task', status: 'queued' as const }
      expect(() => createTaskInput.parse(validInput)).not.toThrow()
      
      const invalidInput = { title: '', status: 'queued' as const }
      expect(() => createTaskInput.parse(invalidInput)).toThrow()
      
      const invalidStatus = { title: 'Test', status: 'invalid' as any }
      expect(() => createTaskInput.parse(invalidStatus)).toThrow()
    })

    it('should handle optional due date', async () => {
      const result = await createTask.execute(
        { 
          title: 'Task with due date', 
          dueAt: '2024-12-31T23:59:59Z',
          status: 'queued' 
        },
        mockContext
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toHaveProperty('dueAt')
      }
    })
  })

  describe('searchWeb', () => {
    it('should return results without requiring an API key', async () => {
      const result = await searchWeb.execute(
        { query: 'test search' },
        mockContext
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toHaveProperty('query', 'test search')
        expect(result.data).toHaveProperty('results')
        expect(Array.isArray(result.data.results)).toBe(true)
        expect(result.data.results.length).toBeGreaterThan(0)
      }
    })

    it('should validate input schema', () => {
      const validInput = { query: 'search query' }
      expect(() => searchWebInput.parse(validInput)).not.toThrow()
      
      const tooShort = { query: 'a' }
      expect(() => searchWebInput.parse(tooShort)).toThrow()
      
      const tooLong = { query: 'a'.repeat(501) }
      expect(() => searchWebInput.parse(tooLong)).toThrow()
    })

    it('should handle empty query', () => {
      const invalidInput = { query: '  ' }
      expect(() => searchWebInput.parse(invalidInput)).toThrow()
    })
  })
})
