// Environment variable validation.
// Fail fast on missing required vars; degrade gracefully on missing optional ones.

const REQUIRED_VARS = ['DATABASE_URL', 'AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const

const OPTIONAL_VARS = [
  // AI / LLM
  'AI_GATEWAY_API_KEY',
  'AI_MODEL',
  'OPENAI_API_KEY',
  'MISTRAL_API_KEY',
  // Security
  'TOKEN_ENCRYPTION_KEY',
  // Integrations
  'TELEGRAM_BOT_TOKEN',
  'PHONE_PROVIDER_API_KEY',
  'PHONE_PROVIDER_API_SECRET',
  // Voice
  'SPEECH_TO_TEXT_API_KEY',
  'TEXT_TO_SPEECH_API_KEY',
  // Web search
  'WEB_SEARCH_API_KEY',
  'SERPER_API_KEY',
  'TAVILY_API_KEY',
] as const

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`)
    }
  }

  for (const varName of OPTIONAL_VARS) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable not set: ${varName} (related feature is disabled)`)
    }
  }

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string (postgresql://...)')
  }

  if (process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length < 32) {
    warnings.push('TOKEN_ENCRYPTION_KEY should be at least 32 characters for secure encryption')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function assertEnv(): void {
  const { valid, errors, warnings } = validateEnv()

  if (!valid) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Environment validation failed:')
      errors.forEach((e) => console.error(`  ✗ ${e}`))
      throw new Error(`Invalid environment configuration: ${errors.join('; ')}`)
    }
    console.error('Environment validation warnings:', errors)
  }

  if (warnings.length > 0) {
    console.warn('Environment warnings (optional integrations will be disabled):')
    warnings.forEach((w) => console.warn(`  · ${w}`))
  }
}

// Module-level guard so any import of this module reports config problems once.
const alreadyValidated = false

if (!alreadyValidated && process.env.NODE_ENV !== 'test') {
  assertEnv()
}

export const env = {
  // Required
  databaseUrl: process.env.DATABASE_URL ?? '',
  authSecret: process.env.AUTH_SECRET ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // AI
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  openAiApiKey: process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY ?? '',
  mistralApiKey: process.env.MISTRAL_API_KEY ?? '',

  // Security
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',

  // Integrations
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  phoneProviderApiKey: process.env.PHONE_PROVIDER_API_KEY ?? '',
  phoneProviderApiSecret: process.env.PHONE_PROVIDER_API_SECRET ?? '',
  speechToTextApiKey: process.env.SPEECH_TO_TEXT_API_KEY ?? '',
  textToSpeechApiKey: process.env.TEXT_TO_SPEECH_API_KEY ?? '',
  serperApiKey: process.env.SERPER_API_KEY ?? '',
  tavilyApiKey: process.env.TAVILY_API_KEY ?? '',

  // Capability flags
  hasLlm: Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.MISTRAL_API_KEY),
  hasWebSearch: Boolean(
    process.env.WEB_SEARCH_API_KEY || process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY,
  ),
  hasTelegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  hasPhone: Boolean(process.env.PHONE_PROVIDER_API_KEY && process.env.PHONE_PROVIDER_API_SECRET),
  hasVoice: Boolean(process.env.SPEECH_TO_TEXT_API_KEY && process.env.TEXT_TO_SPEECH_API_KEY),
} as const