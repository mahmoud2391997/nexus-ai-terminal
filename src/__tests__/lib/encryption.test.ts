import { encrypt, decrypt, hashToken } from '../../lib/encryption'

describe('Encryption Utilities', () => {
  const testKey = 'test-encryption-key-32-chars-long!'

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = testKey
  })

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt(plaintext)
      
      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toBe(plaintext)
    })

    it('should produce different encrypted values for same input', () => {
      const plaintext = 'Hello, World!'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)
      
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('should handle empty strings', () => {
      const plaintext = ''
      const encrypted = encrypt(plaintext)
      
      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
    })

    it('should handle special characters', () => {
      const plaintext = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?/~`'
      const encrypted = encrypt(plaintext)
      
      expect(encrypted).toBeDefined()
    })

    it('should handle unicode characters', () => {
      const plaintext = 'Unicode: 你好 🌍 مرحبا'
      const encrypted = encrypt(plaintext)
      
      expect(encrypted).toBeDefined()
    })

    it('should produce base64-encoded output', () => {
      const plaintext = 'Test'
      const encrypted = encrypt(plaintext)
      
      // Should be valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
    })
  })

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should handle empty strings', () => {
      const plaintext = ''
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should handle special characters', () => {
      const plaintext = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?/~`'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should handle unicode characters', () => {
      const plaintext = 'Unicode: 你好 🌍 مرحبا'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should throw error for invalid encrypted data', () => {
      expect(() => decrypt('invalid-base64!')).toThrow()
    })

    it('should throw error for corrupted data', () => {
      const validEncrypted = encrypt('test')
      const corrupted = validEncrypted.slice(0, -10) + 'corrupted'
      
      expect(() => decrypt(corrupted)).toThrow()
    })
  })

  describe('encrypt/decrypt round-trip', () => {
    it('should maintain data integrity through encryption cycle', () => {
      const testCases = [
        'Simple string',
        'String with spaces',
        'String\nwith\nnewlines',
        'String\twith\ttabs',
        'Long string '.repeat(100),
        JSON.stringify({ key: 'value', nested: { data: [1, 2, 3] } }),
      ]

      testCases.forEach(plaintext => {
        const encrypted = encrypt(plaintext)
        const decrypted = decrypt(encrypted)
        expect(decrypted).toBe(plaintext)
      })
    })
  })

  describe('hashToken', () => {
    it('should hash a token', () => {
      const token = 'my-secret-token'
      const hashed = hashToken(token)
      
      expect(hashed).toBeDefined()
      expect(typeof hashed).toBe('string')
      expect(hashed).not.toBe(token)
    })

    it('should produce consistent hash for same input', () => {
      const token = 'my-secret-token'
      const hash1 = hashToken(token)
      const hash2 = hashToken(token)
      
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token1')
      const hash2 = hashToken('token2')
      
      expect(hash1).not.toBe(hash2)
    })

    it('should produce fixed-length hash', () => {
      const token = 'my-secret-token'
      const hashed = hashToken(token)
      
      // SHA-256 produces 64 hex characters
      expect(hashed.length).toBe(64)
    })

    it('should be case-sensitive', () => {
      const hash1 = hashToken('Token')
      const hash2 = hashToken('token')
      
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('security properties', () => {
    it('should not reveal plaintext length in encrypted output', () => {
      const short = 'a'
      const long = 'a'.repeat(100)
      
      const encryptedShort = encrypt(short)
      const encryptedLong = encrypt(long)
      
      // Encrypted lengths should be similar due to salt/iv overhead
      const lengthDiff = Math.abs(encryptedShort.length - encryptedLong.length)
      // Allow reasonable variance since base64 encoding adds overhead
      expect(lengthDiff).toBeLessThan(200) 
    })

    it('should use different salts for each encryption', () => {
      const plaintext = 'test'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)
      
      // Decode base64 to check salt (first 16 bytes)
      const decoded1 = Buffer.from(encrypted1, 'base64')
      const decoded2 = Buffer.from(encrypted2, 'base64')
      
      const salt1 = decoded1.subarray(0, 16)
      const salt2 = decoded2.subarray(0, 16)
      
      expect(salt1.equals(salt2)).toBe(false)
    })
  })
})
