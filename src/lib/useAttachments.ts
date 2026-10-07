import { useCallback, useState } from 'react'
import { extractDocument, type ExtractedDocument } from './documents'

/**
 * Attachment state for the create-simulation screen. Extraction happens in the
 * browser (see documents.ts); failures are surfaced as notes rather than errors,
 * because a skipped file should never block the whole form.
 */
export function useAttachments() {
  const [attachments, setAttachments] = useState<ExtractedDocument[]>([])
  const [busy, setBusy] = useState(false)

  const add = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 5)
    if (!list.length) return
    setBusy(true)
    try {
      const extracted = await Promise.all(list.map((file) => extractDocument(file)))
      setAttachments((current) => [...current, ...extracted].slice(0, 5))
    } finally {
      setBusy(false)
    }
  }, [])

  const remove = useCallback((name: string) => {
    setAttachments((current) => current.filter((item) => item.name !== name))
  }, [])

  const reset = useCallback(() => setAttachments([]), [])

  const extractedChars = attachments.reduce((sum, item) => sum + item.chars, 0)

  return { attachments, busy, add, remove, reset, extractedChars }
}
