export type GoogleConnectionErrorCode = 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'ACCOUNT_MISMATCH' | 'TEMPORARILY_UNAVAILABLE' | 'SERVER_CONFIGURATION'

export class GoogleConnectionError extends Error {
  constructor(public readonly code: GoogleConnectionErrorCode, message: string) { super(message) }
}
