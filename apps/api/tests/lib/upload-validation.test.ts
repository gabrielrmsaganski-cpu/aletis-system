/**
 * P2-06 — Whitelist de MIME types para uploads.
 */
import { describe, it, expect } from 'vitest'
import {
  isMimeAllowed,
  mimeWhitelist,
  DEFAULT_UPLOAD_WHITELIST,
} from '../../src/lib/upload-validation.js'

describe('upload-validation', () => {
  it('aceita tipos comuns no whitelist default', () => {
    expect(isMimeAllowed('application/pdf')).toBe(true)
    expect(isMimeAllowed('image/png')).toBe(true)
    expect(isMimeAllowed('image/jpeg')).toBe(true)
    expect(isMimeAllowed('text/csv')).toBe(true)
    expect(isMimeAllowed('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
  })

  it('recusa tipos perigosos', () => {
    expect(isMimeAllowed('application/x-msdownload')).toBe(false)
    expect(isMimeAllowed('application/x-sh')).toBe(false)
    expect(isMimeAllowed('text/html')).toBe(false)
    expect(isMimeAllowed('application/javascript')).toBe(false)
    expect(isMimeAllowed(undefined)).toBe(false)
    expect(isMimeAllowed('')).toBe(false)
  })

  it('normaliza casing e descarta charset suffix', () => {
    expect(isMimeAllowed('APPLICATION/PDF')).toBe(true)
    expect(isMimeAllowed('text/csv; charset=utf-8')).toBe(true)
  })

  it('mimeWhitelist combina grupos', () => {
    const w = mimeWhitelist('pdf', 'image')
    expect(w.has('application/pdf')).toBe(true)
    expect(w.has('image/png')).toBe(true)
    expect(w.has('text/csv')).toBe(false) // não está nos grupos
  })

  it('DEFAULT_UPLOAD_WHITELIST tem >= 10 tipos', () => {
    expect(DEFAULT_UPLOAD_WHITELIST.size).toBeGreaterThanOrEqual(10)
  })
})
