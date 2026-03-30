'use client'

/**
 * Generate a stable browser fingerprint from available browser signals.
 * Not cryptographically unique, but sufficient for preventing casual sharing.
 */
export async function getBrowserFingerprint(): Promise<string> {
  const signals = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() ?? '',
    navigator.platform ?? '',
  ]

  const raw = signals.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
