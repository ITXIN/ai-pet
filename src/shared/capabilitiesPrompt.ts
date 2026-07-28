import type { ModelCapabilities } from './types'

function resolveTalkGroupName(caps: ModelCapabilities): string {
  const available = caps.motionGroups
  const keys = Object.keys(available)
  for (const c of ['Talk', 'talk', 'Speak', 'speak', 'Idle', 'idle']) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase())
    if (found && (available[found] ?? 0) > 0) return found
  }
  return keys.find((k) => (available[k] ?? 0) > 0) ?? 'Idle'
}

/** 生成供 LLM 使用的能力附录 */
export function formatCapabilitiesPrompt(caps: ModelCapabilities): string {
  const expr =
    caps.expressions.length > 0
      ? caps.expressions.join(', ')
      : '（无 expression 文件，将用参数表情）'
  const motions = Object.entries(caps.motionGroups)
    .map(([g, n]) => `${g}(${n})`)
    .join(', ')
  const talk = resolveTalkGroupName(caps)
  return `
当前模型可用表情: ${expr}
当前模型可用动作组: ${motions || 'Idle'}
说话时动作组: ${talk}（系统自动循环，无需在回复中写 Talk）
语义动作仍使用: Idle, Tap, Wave, Nod, Shake, Dance, Think（系统会映射到真实动作组）
请只输出协议中的 emotion/motion 标签，不要编造新标签名。`
}
