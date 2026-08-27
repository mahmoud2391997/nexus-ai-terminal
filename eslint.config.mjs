import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'coverage/**', 'playwright-report/**']),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['jest.config.js', 'jest.setup.js', 'playwright.config.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
])