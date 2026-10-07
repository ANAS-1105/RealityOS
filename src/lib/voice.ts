import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Speech-to-text through the browser's own Web Speech API.
 *
 * There is no third-party service, no audio upload and no cost; if the browser
 * does not implement it the hook reports `supported: false` and the UI explains
 * that typing is the way in — rather than showing a microphone that does nothing.
 */
interface SpeechResultLike {
  isFinal: boolean
  0: { transcript: string } | undefined
}

interface SpeechRecognitionEventLike {
  results: { length: number; [index: number]: SpeechResultLike | undefined }
  resultIndex: number
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface RecognitionConstructor {
  new (): RecognitionLike
}

export function useSpeechToText() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const finalRef = useRef('')

  const constructorRef = useRef<RecognitionConstructor | null>(null)
  useEffect(() => {
    const scope = window as unknown as {
      SpeechRecognition?: RecognitionConstructor
      webkitSpeechRecognition?: RecognitionConstructor
    }
    constructorRef.current = scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
  }, [])

  const supported = typeof window !== 'undefined' && Boolean(constructorRef.current)

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Recognition = constructorRef.current
    if (!Recognition) {
      setError('This browser does not support speech recognition. Typing works everywhere.')
      return
    }
    setError(null)
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalRef.current += `${text} `
        else interim += text
      }
      setTranscript(`${finalRef.current}${interim}`.trim())
    }
    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission was blocked. Allow it in your browser, or type the situation instead.'
          : 'Speech recognition stopped unexpectedly. You can type the rest.',
      )
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    try {
      finalRef.current = transcript ? `${transcript} ` : ''
      recognition.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone. Typing works everywhere.')
      setListening(false)
    }
  }, [transcript])

  const reset = useCallback(() => {
    finalRef.current = ''
    setTranscript('')
    setError(null)
  }, [])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { supported, listening, transcript, error, start, stop, reset }
}
