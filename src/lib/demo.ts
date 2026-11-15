// DEMO_MODE=true turns off sign-in: every visitor gets an isolated guest user.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1'
}
