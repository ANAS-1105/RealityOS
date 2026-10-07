/** Minimal structured logging. Never logs cookies, tokens or auth URLs. */
export function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...data })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export async function timed<T>(event: string, fn: () => Promise<T>, data: Record<string, unknown> = {}): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    log('info', event, { ...data, ms: Date.now() - start })
    return result
  } catch (error) {
    log('error', event, { ...data, ms: Date.now() - start, message: error instanceof Error ? error.message : 'unknown' })
    throw error
  }
}
