import { transition, buildIdempotencyKey } from '../../agent/core/execution'

describe('ToolExecution state machine (§22)', () => {
  describe('transition', () => {
    it('should allow PENDING -> RUNNING', () => {
      expect(() => transition('PENDING', 'RUNNING')).not.toThrow()
    })

    it('should allow RUNNING -> WAITING_APPROVAL', () => {
      expect(() => transition('RUNNING', 'WAITING_APPROVAL')).not.toThrow()
    })

    it('should allow WAITING_APPROVAL -> RUNNING', () => {
      expect(() => transition('WAITING_APPROVAL', 'RUNNING')).not.toThrow()
    })

    it('should allow RUNNING -> COMPLETED and RUNNING -> FAILED', () => {
      expect(() => transition('RUNNING', 'COMPLETED')).not.toThrow()
      expect(() => transition('RUNNING', 'FAILED')).not.toThrow()
    })

    it('should allow self-transition (no-op)', () => {
      expect(() => transition('RUNNING', 'RUNNING')).not.toThrow()
    })

    it('should reject illegal COMPLETED -> RUNNING', () => {
      expect(() => transition('COMPLETED', 'RUNNING')).toThrow()
    })

    it('should reject illegal PENDING -> COMPLETED', () => {
      expect(() => transition('PENDING', 'COMPLETED')).toThrow()
    })

    it('should reject illegal FAILED -> RUNNING', () => {
      expect(() => transition('FAILED', 'RUNNING')).toThrow()
    })

    it('should reject illegal COMPLETED -> FAILED', () => {
      expect(() => transition('COMPLETED', 'FAILED')).toThrow()
    })

    it('should reject WAITING_APPROVAL -> COMPLETED (must pass back through RUNNING)', () => {
      expect(() => transition('WAITING_APPROVAL', 'COMPLETED')).toThrow()
    })
  })

  describe('buildIdempotencyKey', () => {
    it('should produce a deterministic 64-char key for the same input', () => {
      const a = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com' })
      const b = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com' })
      expect(a).toBe(b)
      expect(a).toHaveLength(64)
    })

    it('should differ across users for identical input', () => {
      const a = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com' })
      const b = buildIdempotencyKey('user-2', 'sendEmail', { to: 'a@b.com' })
      expect(a).not.toBe(b)
    })

    it('should differ across tools for identical input', () => {
      const a = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com' })
      const b = buildIdempotencyKey('user-1', 'sendTelegramMessage', { to: 'a@b.com' })
      expect(a).not.toBe(b)
    })

    it('should differ when the payload changes', () => {
      const a = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com', body: 'x' })
      const b = buildIdempotencyKey('user-1', 'sendEmail', { to: 'a@b.com', body: 'y' })
      expect(a).not.toBe(b)
    })
  })
})