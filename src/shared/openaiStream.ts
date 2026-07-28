/**
 * 读取 OpenAI 兼容 chat/completions SSE，回调 delta content，返回全文。
 * 若响应体不是 SSE（整段 JSON），则直接解析并回调一次全文。
 */
export async function readChatCompletionSse(
  res: Response,
  onDelta: (chunk: string) => void,
): Promise<string> {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('LLM 返回为空')
    onDelta(content)
    return content
  }

  if (!res.body) throw new Error('LLM 流式响应无 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })

    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith(':')) continue
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        if (!full) throw new Error('LLM 返回为空')
        return full
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        // 忽略非整 JSON 行
      }
    }
  }

  // 处理尾部残留
  const tail = lineBuf.trim()
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!full) throw new Error('LLM 返回为空')
  return full
}
