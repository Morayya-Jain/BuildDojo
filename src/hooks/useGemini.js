import { useCallback } from 'react'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const TIMEOUT_MS = 15000

function cleanJsonString(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim()
}

function getGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callGemini(prompt) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(
      `${GEMINI_URL}?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      let message = `Gemini request failed (${response.status})`
      try {
        const errorData = await response.json()
        const apiMessage = errorData?.error?.message
        if (apiMessage) {
          message = apiMessage
        }
      } catch {
        // Ignore JSON parse issues for error body.
      }
      throw new Error(message)
    }

    const data = await response.json()
    const text = getGeminiText(data)

    if (!text) {
      throw new Error('Gemini returned an empty response.')
    }

    return { data: text, error: null }
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        data: null,
        error: new Error('Request timed out after 15 seconds. Please try again.'),
      }
    }

    return { data: null, error }
  } finally {
    clearTimeout(timeout)
  }
}

export function useGemini() {
  const generateRoadmap = useCallback(async (projectDescription, skillLevel) => {
    const basePrompt = `You are a coding mentor. The user wants to build: ${projectDescription}.\nTheir skill level is: ${skillLevel}.\nGenerate a learning roadmap as a JSON array of exactly 6 tasks.\nEach task guides the user to implement one specific piece of the project themselves.\nNever give code directly in the description or hint fields.\nReturn ONLY a valid raw JSON array. No markdown, no backticks, no explanation.\nSchema: [{id, title, description, hint, exampleOutput}]\nThe exampleOutput field may contain code as it is shown only when explicitly requested.`

    const firstAttempt = await callGemini(basePrompt)
    if (firstAttempt.error) {
      return { data: null, error: firstAttempt.error }
    }

    const parseRoadmap = (text) => {
      const cleaned = cleanJsonString(text)
      const parsed = JSON.parse(cleaned)

      if (!Array.isArray(parsed)) {
        throw new Error('Roadmap response is not an array.')
      }

      if (parsed.length !== 6) {
        throw new Error('Roadmap must contain exactly 6 tasks.')
      }

      return parsed.map((task, index) => ({
        id: task.id || `ai-task-${index + 1}`,
        title: task.title || `Task ${index + 1}`,
        description: task.description || '',
        hint: task.hint || '',
        exampleOutput: task.exampleOutput || '',
        completed: false,
        task_index: index,
      }))
    }

    try {
      const roadmap = parseRoadmap(firstAttempt.data)
      return { data: roadmap, error: null }
    } catch {
      const retryPrompt = `${basePrompt}\nYou must return only raw JSON, nothing else.`
      const secondAttempt = await callGemini(retryPrompt)

      if (secondAttempt.error) {
        return { data: null, error: secondAttempt.error }
      }

      try {
        const roadmap = parseRoadmap(secondAttempt.data)
        return { data: roadmap, error: null }
      } catch (error) {
        return {
          data: null,
          error: new Error(
            `Could not parse roadmap JSON after retry: ${error.message}`,
          ),
        }
      }
    }
  }, [])

  const checkUserCode = useCallback(async (task, userCode) => {
    const prompt = `You are a strict but encouraging coding mentor.\nThe user is working on this task: ${task.description}\nThey have written this code:\n${userCode}\nGive specific targeted feedback on their attempt.\nDo NOT give them the complete solution under any circumstances.\nPoint out exactly what is wrong or missing.\nEnd with a question that nudges them to think about the next step.\nKeep response under 120 words. Be direct and friendly.`

    const result = await callGemini(prompt)
    if (result.error) {
      return { data: null, error: result.error }
    }

    return { data: result.data, error: null }
  }, [])

  const askFollowUp = useCallback(
    async (task, userCode, userQuestion, feedbackHistory) => {
      const prompt = `You are a coding mentor in an ongoing conversation.\nCurrent task: ${task.description}\nUser's current code: ${userCode}\nConversation so far: ${JSON.stringify(feedbackHistory)}\nUser's new question: ${userQuestion}\nAnswer their question helpfully but do not give them complete working code.\nGive hints, ask questions back, point them in the right direction.\nKeep response under 100 words.`

      const result = await callGemini(prompt)
      if (result.error) {
        return { data: null, error: result.error }
      }

      return { data: result.data, error: null }
    },
    [],
  )

  return {
    generateRoadmap,
    checkUserCode,
    askFollowUp,
  }
}
