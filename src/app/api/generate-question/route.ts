import { NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt, pickReferenceQuestion, QUESTION_BANK } from '@/lib/prompts'

type Level = 'ACC' | 'PCC' | 'MCC'
type Mode = 'random' | 'knowledge' | 'sjt'

/** 域代码 → 具体能力项列表（随机取一个用于题库筛选） */
const DOMAIN_MAP: Record<string, string[]> = {
  'ACC-ethics':       ['CC1'],
  'ACC-definition':   ['CC1', 'CC2'],
  'ACC-competency':   ['CC3', 'CC4', 'CC5', 'CC6', 'CC7', 'CC8'],
  'PCC-foundation':   ['CC1', 'CC2'],
  'PCC-relationship': ['CC3', 'CC4', 'CC5'],
  'PCC-communication':['CC6', 'CC7'],
  'PCC-growth':       ['CC8'],
}

/** 把域代码解析为单个 CC 代码；如已是 CC 代码则原样返回 */
function resolveDomain(code: string | undefined): string | undefined {
  if (!code) return undefined
  const mapped = DOMAIN_MAP[code]
  if (!mapped) return code
  return mapped[Math.floor(Math.random() * mapped.length)]
}

type QuestionBankItem = (typeof QUESTION_BANK)[number] & { isOfficial?: boolean }

/**
 * 根据抽到的题目类型，构造传给 DeepSeek 的 userMessage 后缀
 *
 * 三类：
 * 1. isOfficial: true  → 原样呈现，不改编，解析结尾注明
 * 2. 普通题库题        → 按改编规则改编，不注明来源
 * 3. null（无题库参考）→ AI 自编新题，不注明来源
 */
function buildReferenceBlock(refQ: QuestionBankItem | null): string {
  if (!refQ) return '' // AI 自编题，不附参考

  const isOfficial = refQ.isOfficial === true

  const optionsText = `A. ${refQ.options.A}
B. ${refQ.options.B}
C. ${refQ.options.C}
D. ${refQ.options.D}`

  const FORMAT_RULES = `

━━━━━━━━━━━━━━━━━━━━━━
【输出格式（必须严格遵守）】
情景题必须按以下格式输出，一字不差：

【情境】（情境内容）

请问，教练应该如何操作？

最佳操作：
最差操作：

A. （选项内容）
B. （选项内容）
C. （选项内容）
D. （选项内容）

请分别选出最佳和最差操作（填字母即可），提交后我将为你提供详细解析。

【绝对禁止】：
- 禁止在题目任何位置写"ICF官方原题"、"改编自官方"、"本题为官方题"等来源标注
- 禁止出现"【ICF官方原题直接呈现】"等任何标注字样
- 题目部分完全不提来源；来源标注只允许出现在解析末尾`

  if (isOfficial) {
    return `

【参考原题（内容来自ICF官方样题库）】
情境：${refQ.scenario}

${optionsText}

能力维度：${refQ.competency}
${FORMAT_RULES}

按格式出题，情境和选项可做轻微措辞调整（不改变考点）。
解析末尾最后一行加：📌 本题为ICF官方样题`
  }

  // 普通题库题：按改编规则改编
  return `

【参考题目】
情境：${refQ.scenario}

${optionsText}

能力维度：${refQ.competency}
${FORMAT_RULES}

【改编规则（必须执行）】
你拿到的是一道参考题，请按以下规则改编后出题：

情境改编（只改变表面背景，不改变核心事件）：
· 客户的职业/行业（如把"律师"改成"医生"，把"高管"改成"创业者"）
· 会谈次数或时间背景（如把"第四次"改成"第三次"）
· 人物关系的次要描述（如把"朋友介绍的下属"改成"同行推荐的客户"）
· 核心事件本身必须保留，这是考点所在

选项改编（每个选项都要调整）：
· 换一种表达方式，意思相近但用词不同
· 微调行为的步骤或顺序，制造更细微的干扰
· 打乱ABCD的排列顺序，Best和Worst不固定在原来的位置
· 保持四个选项难度平衡，没有一个让人一眼排除

禁止：直接复制原题的情境描述原文或选项原文。`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { level, conversationHistory = [] } = body

  if (!level) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const QUESTION_RULES = `
【核心规则 — 每次只做一件事】
- 出题时只出题，解析时只给解析，报告时只输出报告，分析时只输出分析，绝对不能混在一起
- 出完题后禁止附加任何上一题的结束语
- 输出分析或报告后，绝对不出任何新题

【出题结尾格式（必须严格遵守）】
- 情景题结尾：请分别选出最佳和最差操作（填字母即可），提交后我将为你提供详细解析。
- 知识类题结尾：请选出正确答案（填字母即可）。

【薄弱点分析规则】
当用户请求薄弱点分析时，只输出分析报告，分析结束后绝对不出任何新题。
报告格式如下（严格遵守）：
📊 薄弱点分析

本轮练习：共X题（知识类X题 / 情景类X题）
重点练习的能力项：（列出涉及的CC项）

需要加强的方向：
· （具体能力项）：（说明为什么需要加强，答错了哪类题）

建议：（1-2句具体学习建议）

---
需要我针对薄弱点出题强化练习吗？

【学习报告规则】
当用户请求学习报告时，只输出报告，报告结束后绝对不出任何新题。
报告格式如下（严格遵守）：
📊 学习报告

本轮练习：共X题（知识类X题 / 情景类X题）
知识类正确率：X%
情景类：已完成X题

重点练习的能力项：（列出本轮涉及的CC项）

建议加强：（根据答错的题或能力项给出具体建议）

---
说"下一题"继续练习，或说"针对薄弱点出题"进行强化。

【混合模式规则】
当用户说"出一道知识题"、"出知识类题"时，
出一道知识类单选题（题干 + ABCD四选一 + 唯一正确答案）。`

  // ── 分支：提交答案 vs 正常出题/对话 ─────────────────────────
  if (body.isSubmittingAnswer) {
    const { userAnswer } = body
    if (!userAnswer) return NextResponse.json({ error: '参数缺失' }, { status: 400 })

    const ANALYSIS_SYSTEM = buildSystemPrompt(level as Level) + `
【当前任务：给出解析】
学员刚提交了上一道题的答案。你必须且只能做一件事：
1. 给出完整解析（情景题给四层排序分析，知识题给正确答案解释）
2. 解析结尾只写：解析完毕！说"下一题"继续。
3. 绝对不出任何新题`

    const analysisUserMsg = `学员答案：${userAnswer}。请给出完整解析。`

    const messages = [
      { role: 'system', content: ANALYSIS_SYSTEM },
      ...conversationHistory,
      { role: 'user', content: analysisUserMsg },
    ]

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.5, max_tokens: 2000 }),
    })
    if (!res.ok) return NextResponse.json({ error: '解析生成失败，请重试' }, { status: 502 })
    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    if (!content) return NextResponse.json({ error: '返回内容为空，请重试' }, { status: 502 })
    return NextResponse.json({ content })
  }

  // ── 正常出题/对话路径 ──────────────────────────────────────
  const { mode, competency, userMessage } = body
  if (!userMessage) return NextResponse.json({ error: '参数缺失' }, { status: 400 })

  const systemPrompt = buildSystemPrompt(level as Level) + QUESTION_RULES

  // ACC 固定知识类；random 模式 50/50 随机决定本题类型
  let actualMode: Mode = level === 'ACC' ? 'knowledge' : (mode as Mode)
  if (actualMode === 'random') {
    actualMode = Math.random() < 0.5 ? 'knowledge' : 'sjt'
  }

  // 仅 sjt 模式使用情景题库参考；knowledge 模式让 AI 自编
  const resolvedCompetency = resolveDomain(competency)
  let refQ: QuestionBankItem | null = null
  if (actualMode === 'sjt') {
    refQ = pickReferenceQuestion('sjt', resolvedCompetency) as QuestionBankItem | null
  }

  const modeHint = actualMode === 'knowledge'
    ? '\n\n【本题类型】请出一道知识类单选题（题干+ABCD四选一，选出唯一正确答案）。'
    : '\n\n【本题类型】请出一道情景题（按规定格式，包含最佳/最差操作）。'

  const referenceBlock = buildReferenceBlock(refQ)
  const isOutQuestion = !userMessage.includes('薄弱') && !userMessage.includes('报告') && !userMessage.includes('分析')
  const finalUserMessage = userMessage + (isOutQuestion ? modeHint : '') + referenceBlock

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: finalUserMessage },
  ]

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.8,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('DeepSeek error:', err)
    return NextResponse.json({ error: '题目生成失败，请重试' }, { status: 502 })
  }

  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''

  if (!content) {
    return NextResponse.json({ error: '返回内容为空，请重试' }, { status: 502 })
  }

  return NextResponse.json({ content })
}
