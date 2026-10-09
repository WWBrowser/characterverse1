import { useCallback, useRef, useState } from 'react'
import {
  fetchServerSentEvents,
  useChat,
  createChatClientOptions,
} from '@tanstack/ai-react'
import type { InferChatMessages } from '@tanstack/ai-react'
import { getSessionId } from './create-ui'

// Default chat options for simple usage
const defaultChatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('/api/chat'),
})

export type ChatMessages = InferChatMessages<typeof defaultChatOptions>

export const useAIChat = () => {
  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return useChat(chatOptions)
}

export type CharacterChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * Single-character chat backed by the JSON `/api/chat/$id` endpoint, which
 * talks to the Netlify AI Gateway directly. Used by both the full-page chat and
 * each panel of the Twin "side by side" view.
 *
 * `options.getUserPersona` is read at send time so the user's chosen persona
 * (from Chat Settings) is folded into every reply without re-creating the hook.
 *
 * `options.getNode` is read the same way. When it returns a Codex satellite id,
 * the turn is answered by that split's temperament instead of the character's
 * own — same knowledge, different personality.
 */
export function useCharacterChat(
  characterId: number,
  conversationId: number,
  options?: { getUserPersona?: () => string; getNode?: () => string },
) {
  const [messages, setMessages] = useState<CharacterChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const counter = useRef(0)
  const loadingRef = useRef(false)

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loadingRef.current) return
      loadingRef.current = true
      setError('')
      setMessages((prev) => [
        ...prev,
        { id: `u-${counter.current++}`, role: 'user', content: trimmed },
      ])
      setIsLoading(true)

      try {
        const res = await fetch(`/api/chat/${characterId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            sessionId: getSessionId(),
            userPersona: options?.getUserPersona?.() || '',
            node: options?.getNode?.() || '',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'The character could not reply right now.')
        } else {
          setMessages((prev) => [
            ...prev,
            { id: `a-${counter.current++}`, role: 'assistant', content: data.reply || '' },
          ])
        }
      } catch {
        setError('Something went wrong reaching the chat.')
      } finally {
        loadingRef.current = false
        setIsLoading(false)
      }
    },
    [characterId, conversationId, options],
  )

  // Hydrate the transcript from persisted history (used after Restart / on load).
  const setHistory = useCallback((rows: { role: string; content: string }[]) => {
    setMessages(
      rows
        .filter((m) => m.content)
        .map((m) => ({
          id: `h-${counter.current++}`,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
    )
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError('')
  }, [])

  return { messages, sendMessage, isLoading, error, clearMessages, setHistory }
}
