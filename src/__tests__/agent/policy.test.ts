import { evaluateToolPolicy, isHighRiskTool, requiresReApproval, isOwnedResource } from '../../agent/policy'
import type { ToolStatus } from '../../agent/types'

describe('Policy Engine', () => {
  describe('evaluateToolPolicy', () => {
    it('should allow SAFE tools without approval', () => {
      const result = evaluateToolPolicy('getCurrentTime')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
      expect(result.riskLevel).toBe('SAFE')
    })

    it('should allow searchWeb without approval', () => {
      const result = evaluateToolPolicy('searchWeb')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
      expect(result.riskLevel).toBe('SAFE')
    })

    it('should require approval for CONFIRMATION_REQUIRED tools', () => {
      const result = evaluateToolPolicy('createTask')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.riskLevel).toBe('CONFIRMATION_REQUIRED')
      expect(result.reason).toContain('requires your approval')
    })

    it('should require approval for sendEmail', () => {
      const result = evaluateToolPolicy('sendEmail')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.riskLevel).toBe('CONFIRMATION_REQUIRED')
    })

    it('should require approval for HIGH_RISK tools with special message', () => {
      const result = evaluateToolPolicy('confirmOrder')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.riskLevel).toBe('HIGH_RISK')
      expect(result.reason).toContain('high risk')
      expect(result.reason).toContain('cannot be auto-approved')
    })

    it('should require approval for deleteData', () => {
      const result = evaluateToolPolicy('deleteData')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.riskLevel).toBe('HIGH_RISK')
    })

    it('should default unknown tools to CONFIRMATION_REQUIRED', () => {
      const result = evaluateToolPolicy('unknownTool')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
      expect(result.riskLevel).toBe('CONFIRMATION_REQUIRED')
    })

    it('should block tools in non-runnable states', () => {
      const nonRunnableStates: ToolStatus[] = ['WAITING_APPROVAL', 'COMPLETED', 'FAILED']
      
      nonRunnableStates.forEach(status => {
        const result = evaluateToolPolicy('getCurrentTime', status)
        expect(result.allowed).toBe(false)
        expect(result.requiresApproval).toBe(false)
        expect(result.reason).toContain('not in a runnable state')
      })
    })

    it('should allow tools in PENDING state', () => {
      const result = evaluateToolPolicy('getCurrentTime', 'PENDING')
      expect(result.allowed).toBe(true)
    })

    it('should allow tools in RUNNING state', () => {
      const result = evaluateToolPolicy('getCurrentTime', 'RUNNING')
      expect(result.allowed).toBe(true)
    })
  })

  describe('isHighRiskTool', () => {
    it('should identify HIGH_RISK tools', () => {
      expect(isHighRiskTool('confirmOrder')).toBe(true)
      expect(isHighRiskTool('spendMoney')).toBe(true)
      expect(isHighRiskTool('deleteData')).toBe(true)
      expect(isHighRiskTool('cancelAppointment')).toBe(true)
      expect(isHighRiskTool('broadcastMessage')).toBe(true)
    })

    it('should not identify SAFE tools as high risk', () => {
      expect(isHighRiskTool('getCurrentTime')).toBe(false)
      expect(isHighRiskTool('searchWeb')).toBe(false)
    })

    it('should not identify CONFIRMATION_REQUIRED tools as high risk', () => {
      expect(isHighRiskTool('createTask')).toBe(false)
      expect(isHighRiskTool('sendEmail')).toBe(false)
    })
  })

  describe('requiresReApproval', () => {
    it('should require re-approval for HIGH_RISK tools with changed payload', () => {
      const oldPayload = { amount: 100 }
      const newPayload = { amount: 200 }
      
      expect(requiresReApproval('confirmOrder', oldPayload, newPayload)).toBe(true)
    })

    it('should not require re-approval for HIGH_RISK tools with same payload', () => {
      const payload = { amount: 100 }
      
      expect(requiresReApproval('confirmOrder', payload, payload)).toBe(false)
    })

    it('should not require re-approval for non-HIGH_RISK tools', () => {
      const oldPayload = { title: 'Task 1' }
      const newPayload = { title: 'Task 2' }
      
      expect(requiresReApproval('createTask', oldPayload, newPayload)).toBe(false)
    })

    it('should handle nested object changes', () => {
      const oldPayload = { order: { items: ['a'], total: 100 } }
      const newPayload = { order: { items: ['a', 'b'], total: 200 } }
      
      expect(requiresReApproval('confirmOrder', oldPayload, newPayload)).toBe(true)
    })
  })

  describe('isOwnedResource', () => {
    it('should return true when resource belongs to user', () => {
      expect(isOwnedResource('user-123', 'user-123')).toBe(true)
    })

    it('should return false when resource belongs to different user', () => {
      expect(isOwnedResource('user-123', 'user-456')).toBe(false)
    })

    it('should return false when resourceUserId is empty', () => {
      expect(isOwnedResource('', 'user-123')).toBe(false)
    })

    it('should return false when resourceUserId is null', () => {
      expect(isOwnedResource(null as any, 'user-123')).toBe(false)
    })

    it('should return false when resourceUserId is undefined', () => {
      expect(isOwnedResource(undefined as any, 'user-123')).toBe(false)
    })
  })
})
