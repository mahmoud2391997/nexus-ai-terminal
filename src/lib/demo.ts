// Demo mode turns off sign-in: every visitor gets an isolated guest user.
// On when DEMO_MODE=true/1, or automatically when Google login isn't configured
// (no GOOGLE_CLIENT_ID), since sign-in could not work anyway.
// Set DEMO_MODE=false to force real sign-in.
export function isDemoMode(): boolean {
  const flag = (process.env.DEMO_MODE ?? '').toLowerCase()
  if (flag === 'true' || flag === '1') return true
  if (flag === 'false' || flag === '0') return false
  return !process.env.GOOGLE_CLIENT_ID
}
