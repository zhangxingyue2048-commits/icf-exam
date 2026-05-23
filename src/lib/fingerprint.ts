'use client'

const FP_KEY = '_icf_fp'

export async function getBrowserFingerprint(): Promise<string> {
  const cached = localStorage.getItem(FP_KEY)
  if (cached) return cached

  const signals = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth.toString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() ?? '',
  ]

  const raw = signals.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const fp = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  localStorage.setItem(FP_KEY, fp)
  return fp
}
