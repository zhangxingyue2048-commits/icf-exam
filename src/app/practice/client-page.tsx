'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()


// ─── Types ────────────────────────────────────────────────────────────────────

type Level = 'ACC' | 'PCC' | 'MCC'
type Mode = 'random' | 'knowledge' | 'sjt'
type MessageType = 'question' | 'explanation' | 'assistant' | 'user'

interface Message {
  id: string
  role: 'user' | 'assistant'
  type: MessageType
  content: string
}

interface APIMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LocalAnswer {
  competency: string
  questionType: 'knowledge' | 'sjt'
  userAnswer: string
  isCorrect: boolean | null
}

interface ScenarioInteraction {
  question: string
  userAnswer: string
  explanation: string
  competency: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPETENCIES = [
  { id: 'CC1', label: 'CC1 展现道德实践' },
  { id: 'CC2', label: 'CC2 体现教练思维' },
  { id: 'CC3', label: 'CC3 建立并维护协议' },
  { id: 'CC4', label: 'CC4 培养信任与安全感' },
  { id: 'CC5', label: 'CC5 保持临在' },
  { id: 'CC6', label: 'CC6 积极倾听' },
  { id: 'CC7', label: 'CC7 唤起觉察' },
  { id: 'CC8', label: 'CC8 促进客户成长' },
]

const ACC_DOMAINS = [
  {
    code: 'ACC-ethics', label: '教练伦理',
    desc: '道德准则违规识别、利益冲突、保密原则',
    competencies: ['CC1'],
  },
  {
    code: 'ACC-definition', label: '教练定义与边界',
    desc: '教练vs咨询vs治疗、何时转介绍、心理健康识别',
    competencies: ['CC1', 'CC2'],
  },
  {
    code: 'ACC-competency', label: '能力策略与技术',
    desc: '教练协议、核心能力、目标设定、教练工具',
    competencies: ['CC3', 'CC4', 'CC5', 'CC6', 'CC7', 'CC8'],
  },
]

const PCC_DOMAINS = [
  {
    code: 'PCC-foundation', label: 'Foundation 基础',
    competencies: ['CC1', 'CC2'],
  },
  {
    code: 'PCC-relationship', label: 'Co-Creating the Relationship 共创关系',
    competencies: ['CC3', 'CC4', 'CC5'],
  },
  {
    code: 'PCC-communication', label: 'Communicating Effectively 高效沟通',
    competencies: ['CC6', 'CC7'],
  },
  {
    code: 'PCC-growth', label: 'Cultivating Learning and Growth 促进学习和成长',
    competencies: ['CC8'],
  },
]

const COMPETENCY_LABELS: Record<string, string> = {
  ...Object.fromEntries(COMPETENCIES.map(c => [c.id, c.label])),
  ...Object.fromEntries(ACC_DOMAINS.map(d => [d.code, d.label])),
  ...Object.fromEntries(PCC_DOMAINS.map(d => [d.code, d.label])),
}

const LEVEL_COLORS: Record<Level, string> = {
  ACC: 'bg-blue-100 text-blue-700 border-blue-200',
  PCC: 'bg-purple-100 text-purple-700 border-purple-200',
  MCC: 'bg-amber-100 text-amber-700 border-amber-200',
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) }

function detectMessageType(content: string): MessageType {
  if (content.includes('【选项排序分析') || content.includes('【解析】') || content.includes('参考答案')) return 'explanation'
  if (content.includes('最佳操作') && content.includes('最差操作')) return 'question'
  if (content.includes('【情境】') || content.includes('【知识题】')) return 'question'
  return 'assistant'
}

/** 判断当前等待答案的题是否为情景题 */
function lastAssistantIsScenario(messages: Message[]): boolean {
  const last = [...messages].reverse().find(m => m.role === 'assistant' && m.type === 'question')
  return !!(last?.content.includes('最佳操作：'))
}

function parseCorrectAnswer(explanation: string): string | null {
  // Match patterns like "参考答案：A", "正确答案：B", "答案：C", "答案是D"
  const match = explanation.match(/(?:参考|正确)?答案[：:是为]\s*([A-D])/i)
  return match ? match[1].toUpperCase() : null
}

function detectIntent(text: string): 'target-weak' | 'weak' | 'report' | null {
  if (/薄弱点出题|薄弱的题|弱点出题|针对.*弱/.test(text)) return 'target-weak'
  if (/薄弱|弱点|哪里不好|不擅长/.test(text)) return 'weak'
  if (/报告|总结一下|学习情况|学习报告/.test(text)) return 'report'
  return null
}

function buildAutoReportPrompt(answers: LocalAnswer[], count: number): string {
  const stats: Record<string, { total: number; correct: number; wrong: number; scenario: number }> = {}
  for (const a of answers) {
    if (!stats[a.competency]) stats[a.competency] = { total: 0, correct: 0, wrong: 0, scenario: 0 }
    stats[a.competency].total++
    if (a.isCorrect === true) stats[a.competency].correct++
    if (a.isCorrect === false) stats[a.competency].wrong++
    if (a.questionType === 'sjt') stats[a.competency].scenario++
  }

  const knowledgeAnswers = answers.filter(a => a.questionType === 'knowledge')
  const sjtAnswers = answers.filter(a => a.questionType === 'sjt')
  const correctCount = knowledgeAnswers.filter(a => a.isCorrect === true).length
  const correctRate = knowledgeAnswers.length > 0
    ? Math.round(correctCount / knowledgeAnswers.length * 100)
    : null

  // 在客户端计算弱项，不让 AI 自行判断
  const weakItems = Object.entries(stats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)
    .map(([c, s]) => `${c}（答错${s.wrong}/${s.total}题）`)

  const statsLines = Object.entries(stats)
    .map(([c, s]) => {
      const kCount = s.total - s.scenario
      return `${c}：共${s.total}题${s.scenario > 0 ? `（含${s.scenario}道情景题）` : ''}${kCount > 0 ? `，知识类答对${s.correct}/${kCount}题` : ''}`
    })
    .join('\n')

  const weakSection = weakItems.length === 0
    ? '【建议】本轮练习表现优秀，继续保持！'
    : `【需要加强】${weakItems.join('、')}\n【建议】请重点复习上述能力项的核心概念。`

  return `请生成学习报告（严格基于以下数据，不得编造）。

【答题数据】
本轮练习：共${answers.length}题（知识类${knowledgeAnswers.length}题 / 情景类${sjtAnswers.length}题）
${correctRate !== null ? `知识类正确率：${correctRate}%（答对${correctCount}/${knowledgeAnswers.length}题）` : ''}

各能力项明细：
${statsLines}

${weakSection}

请按以下格式输出报告，只使用上方提供的数据，不得推断或编造未出现在数据中的弱点：

📊 学习报告

本轮练习：共${answers.length}题（知识类${knowledgeAnswers.length}题 / 情景类${sjtAnswers.length}题）
${correctRate !== null ? `知识类正确率：${correctRate}%` : ''}
${sjtAnswers.length > 0 ? `情景类：已完成${sjtAnswers.length}题` : ''}

重点练习的能力项：（从数据中列出）

${weakItems.length === 0 ? '本轮练习表现优秀，继续保持！' : `需要加强：${weakItems.join('、')}`}

建议：（根据数据给出1-2句，全对时写鼓励语）

---
说"下一题"继续练习，或说"针对薄弱点出题"进行强化。`
}

function buildConsistencyPrompt(scenarios: ScenarioInteraction[]): string {
  const pairs = scenarios.map((s, i) =>
    `【第${i + 1}题 · ${s.competency}】\n题目：${s.question.slice(0, 200)}...\n学员排序：${s.userAnswer}\n解析要点：${s.explanation.slice(0, 300)}...`
  ).join('\n\n')
  return `请对学员最近${scenarios.length}道情景题的作答进行一致性分析：\n\n${pairs}\n\n【分析要求——严格遵守】\n1. 首先判断学员在这${scenarios.length}题中是否有答错记录（对照解析中的最佳/最差选项与学员实际排序）\n2. 如果学员所有题目的最佳和最差都选对了：只写"整体一致性高，判断框架稳定！"，不给任何改进建议，禁止提及"次佳"或"可以进一步练习"\n3. 只有当学员有明确答错记录时，才分析不一致之处并给出建议\n4. 如有矛盾，用"我注意到"而非"你前后矛盾"的语气指出\n5. 分析控制在150字内，分析结束后不出任何新题，最后一句只写：说"下一题"继续练习。`
}

// ─── Selection Screen ─────────────────────────────────────────────────────────

interface SelectionScreenProps {
  level: Level
  onStart: (level: Level, mode: Mode, competency: string | null) => void
}

function SelectionScreen({ level, onStart }: SelectionScreenProps) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [competency, setCompetency] = useState<string | null>(null)

  const effectiveMode: Mode | null = level === 'ACC' ? 'knowledge' : mode
  const canStart = effectiveMode !== null

  function toggleCompetency(code: string) {
    setCompetency(prev => prev === code ? null : code)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] py-8">
      <div className="card w-full max-w-lg space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">ICF笔试练习</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">选择备考级别和练习模式开始</p>
        </div>

        {/* Level display */}
        <p className="text-xs text-[var(--text-muted)]">当前备考级别：{level}</p>

        {/* Mode */}
        {level === 'ACC' ? (
          <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
            ACC 级别仅含知识类单选题，无需选择模式
          </div>
        ) : level ? (
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)] mb-3">练习模式</p>
            <div className="flex flex-col gap-2">
              {[
                { id: 'random', label: '随机混合', desc: '知识类与情景题交替出题' },
                { id: 'knowledge', label: '知识类单选', desc: '概念、定义、边界判断' },
                { id: 'sjt', label: '情景题', desc: '四选项排序，考察实战判断' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id as Mode)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    mode === m.id
                      ? 'border-[var(--primary)] bg-[#e8f0f8]'
                      : 'border-[var(--border)] hover:border-[var(--primary-light)]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                    mode === m.id ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-gray-300'
                  }`} />
                  <div>
                    <span className="font-medium text-sm text-[var(--foreground)]">{m.label}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">{m.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Specialization */}
        {level === 'ACC' && (
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
              考试板块 <span className="font-normal text-[var(--text-muted)]">（可选，不选则随机）</span>
            </p>
            <div className="flex flex-col gap-2 mt-2">
              {ACC_DOMAINS.map((d) => (
                <button
                  key={d.code}
                  onClick={() => toggleCompetency(d.code)}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    competency === d.code
                      ? 'border-[var(--primary)] bg-[#e8f0f8]'
                      : 'border-[var(--border)] hover:border-[var(--primary-light)]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                    competency === d.code ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-gray-300'
                  }`} />
                  <div>
                    <span className="font-medium text-sm text-[var(--foreground)]">{d.label}</span>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{d.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {(level === 'PCC' || level === 'MCC') && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
                考试领域 <span className="font-normal text-[var(--text-muted)]">（可选）</span>
              </p>
              <div className="flex flex-col gap-2 mt-2">
                {PCC_DOMAINS.map((d) => (
                  <button
                    key={d.code}
                    onClick={() => toggleCompetency(d.code)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                      competency === d.code
                        ? 'border-[var(--primary)] bg-[#e8f0f8]'
                        : 'border-[var(--border)] hover:border-[var(--primary-light)]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      competency === d.code ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-gray-300'
                    }`} />
                    <div className="flex-1">
                      <span className="font-medium text-sm text-[var(--foreground)]">{d.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
                能力项细选 <span className="font-normal text-[var(--text-muted)]">（可选，与领域独立使用）</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {COMPETENCIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCompetency(c.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      competency === c.id
                        ? 'border-[var(--primary)] bg-[#e8f0f8] text-[var(--primary)] font-semibold'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary-light)]'
                    }`}
                  >
                    {c.id}
                  </button>
                ))}
              </div>
            </div>

            {competency && (
              <p className="text-xs text-[var(--primary)]">
                已选：{COMPETENCY_LABELS[competency] ?? competency}
              </p>
            )}
          </div>
        )}

        {/* Welcome card */}
        <div className="px-4 py-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
          <p className="text-sm font-semibold text-blue-800 mb-2">你可以这样使用：</p>
          <ul className="space-y-1 text-xs text-blue-700">
            <li>· 按级别练习：ACC知识类 / PCC·MCC情景题</li>
            <li>· 指定板块练习：选择对应的考试板块或能力项</li>
            <li>· 对话指定出题：直接说"给我出CC7的题"或"出一道伦理题"</li>
            <li>· 分析薄弱点：说"分析我的薄弱点"</li>
            <li>· 生成学习报告：说"给我学习报告"（每10题自动触发）</li>
            <li>· 补考专项练习：选择上次考试未达标的板块定向练习</li>
          </ul>
        </div>

        <button
          onClick={() => level && effectiveMode && onStart(level, effectiveMode, competency)}
          disabled={!canStart}
          className="btn-primary w-full"
        >
          开始练习
        </button>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-[var(--primary)] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }
  if (message.type === 'explanation') {
    return (
      <div className="flex justify-start">
        <div className="no-select max-w-[92%] bg-green-50 border border-green-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="no-select max-w-[92%] bg-white border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap shadow-sm">
        {message.content}
      </div>
    </div>
  )
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

interface ChatScreenProps {
  level: Level
  mode: Mode
  competency: string | null
  studentName: string
  onReset: () => void
  onLogout: () => void
}

function ChatScreen({ level, mode, competency, studentName, onReset, onLogout }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<APIMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [currentCompetency, setCurrentCompetency] = useState<string | null>(competency)
  const [showHistory, setShowHistory] = useState(false)

  // Persistent session id
  const [sessionId, setSessionId] = useState<string>('')
  useEffect(() => {
    const existing = localStorage.getItem('practice_session_id')
    const id = existing || `prac_${Date.now()}_${Math.random().toString(36).slice(2)}`
    if (!existing) localStorage.setItem('practice_session_id', id)
    setSessionId(id)
  }, [])

  // Answer tracking
  const [answerHistory, setAnswerHistory] = useState<LocalAnswer[]>([])
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioInteraction[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<APIMessage[]>([])

  useEffect(() => { historyRef.current = history }, [history])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // ── 历史记录加载（sessionId就绪后执行） ──────────────────────
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!sessionId || initializedRef.current) return
    initializedRef.current = true

    // 1. 尝试从 localStorage 恢复聊天记录
    const savedChat = localStorage.getItem(`chat_history_${sessionId}`)
    if (savedChat) {
      try {
        const savedMessages: Message[] = JSON.parse(savedChat)
        if (savedMessages.length > 0) {
          setMessages([
            ...savedMessages,
            {
              id: uid(), role: 'assistant', type: 'assistant',
              content: `📖 已恢复上次练习记录，共${savedMessages.length}条对话。说"下一题"继续练习。`,
            },
          ])
          // 恢复对话历史（供 API 使用）
          const apiHistory: APIMessage[] = savedMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
          setHistory(apiHistory)
          historyRef.current = apiHistory
          return // 有历史，不发初始题
        }
      } catch { /* 解析失败则正常初始化 */ }
    }

    // 2. 无历史记录，发出第一道题
    const label = competency ? (COMPETENCY_LABELS[competency] ?? competency) : null
    const initMsg = label ? `请出一道${label}相关的题目` : '请出第一道题'
    sendMessage(initMsg)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // 每次 messages 更新时保存到 localStorage（最近50条）
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chat_history_${sessionId}`, JSON.stringify(messages.slice(-50)))
    }
  }, [messages, sessionId])

  // 从 Supabase 恢复答题统计数据
  useEffect(() => {
    if (!sessionId) return
    const loadStats = async () => {
      const { data } = await supabase
        .from('practice_records')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (data && data.length > 0) {
        const restored: LocalAnswer[] = data.map(r => ({
          competency: r.competency || '综合',
          questionType: r.question_type as 'knowledge' | 'sjt',
          userAnswer: r.user_answer || '',
          isCorrect: r.is_correct,
        }))
        setAnswerHistory(restored)
      }
    }
    loadStats()
  }, [sessionId])

  // Auto-trigger: every 10 total answers
  useEffect(() => {
    if (answerHistory.length > 0 && answerHistory.length % 10 === 0) {
      const prompt = buildAutoReportPrompt(answerHistory, answerHistory.length)
      setTimeout(() => sendSystemTrigger(prompt), 800)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerHistory.length])

  // Auto-trigger: every 5 scenario answers
  useEffect(() => {
    if (scenarioHistory.length > 0 && scenarioHistory.length % 5 === 0) {
      const prompt = buildConsistencyPrompt(scenarioHistory.slice(-5))
      setTimeout(() => sendSystemTrigger(prompt), 800)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioHistory.length])

  // true = AI just showed a question, waiting for user's answer
  const [isWaiting, setIsWaiting] = useState(false)

  // Detect waiting state from last AI message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return
    if (lastMsg.content.includes('填字母即可')) setIsWaiting(true)
    if (
      lastMsg.content.includes('解析完毕') ||
      lastMsg.content.includes('薄弱点分析') ||
      lastMsg.content.includes('📊 学习报告') ||
      lastMsg.content.includes('需要我针对薄弱点出题') ||
      lastMsg.content.includes('针对薄弱点出题')
    ) setIsWaiting(false)
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userText = text.trim()
    setInput('')

    const ccMatch = userText.match(/CC[1-8]/)
    if (ccMatch) setCurrentCompetency(ccMatch[0])

    const userMsg: Message = { id: uid(), role: 'user', type: 'user', content: userText }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const curHistory = historyRef.current

    // ── 提交答案路径 ─────────────────────────────────────────
    if (isWaiting) {
      setIsWaiting(false)
      const newHistory: APIMessage[] = [...curHistory, { role: 'user', content: `学员答案：${userText}` }]
      try {
        const res = await fetch('/api/generate-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isSubmittingAnswer: true,
            userAnswer: userText,
            level,
            conversationHistory: curHistory,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '请求失败')
        const content: string = data.content
        const type = detectMessageType(content)

        // 记录答题结果
        const isScenario = lastAssistantIsScenario(messages)
        const questionType: 'knowledge' | 'sjt' = isScenario ? 'sjt' : 'knowledge'
        const correctAnswer = parseCorrectAnswer(content)
        const isCorrect = correctAnswer ? userText.trim().toUpperCase().replace(/[^A-D]/g, '') === correctAnswer : null
        const comp = currentCompetency || '综合'
        setAnswerHistory(prev => [...prev, { competency: comp, questionType, userAnswer: userText, isCorrect }])
        supabase.from('practice_records').insert({
          session_id: sessionId, level, question_type: questionType,
          competency: comp, user_answer: userText, is_correct: isCorrect ?? null,
        }).then(({ error }) => { if (error) console.warn('DB insert error:', error.message) })
        if (questionType === 'sjt') {
          const lastQ = [...messages].reverse().find(m => m.type === 'question')
          setScenarioHistory(prev => [...prev, {
            question: lastQ?.content ?? '', userAnswer: userText, explanation: content, competency: comp,
          }])
        }

        const aiMsg: Message = { id: uid(), role: 'assistant', type, content }
        setMessages(prev => [...prev, aiMsg])
        const updated: APIMessage[] = [...newHistory, { role: 'assistant' as const, content }]
        setHistory(updated)
        historyRef.current = updated
      } catch {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', type: 'assistant', content: '抱歉，出现了网络错误，请稍后重试。' }])
      } finally {
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
      return
    }

    // ── 正常出题/对话路径 ────────────────────────────────────
    const intent = detectIntent(userText)
    // 是否明确要求出新题（含各种表达方式）
    const isNextQuestion = /下一题|继续|再出一道|出题|新题|出.{0,10}题/.test(userText)
    // 是否为追问（曾经收到过解析，且当前不是出题请求也不是特殊意图）
    const hasHadExplanation = messages.some(m => m.role === 'assistant' && m.type === 'explanation')
    const isFollowUpDialog = !intent && !isNextQuestion && hasHadExplanation

    let apiMessage = userText

    if (isFollowUpDialog) {
      apiMessage = `学员对刚才的解析有疑问，请直接回答以下问题，不要出新题：${userText}`
    }

    if (intent === 'weak' || intent === 'target-weak') {
      const { data: dbRecords } = await supabase
        .from('practice_records')
        .select('competency, is_correct')
        .eq('session_id', sessionId)
        .eq('question_type', 'knowledge')

      const stats: Record<string, { total: number; wrong: number }> = {}
      for (const r of dbRecords ?? []) {
        const c = r.competency || '综合'
        if (!stats[c]) stats[c] = { total: 0, wrong: 0 }
        stats[c].total++
        if (r.is_correct === false) stats[c].wrong++
      }

      if (intent === 'weak') {
        const statsText = Object.entries(stats).length > 0
          ? Object.entries(stats)
              .map(([c, s]) => `${c}：${s.total}题，答错${s.wrong}题（错误率${Math.round(s.wrong / s.total * 100)}%）`)
              .join('\n')
          : '暂无知识类答题记录'
        const scenStats = scenarioHistory.length > 0 ? `\n情景题：共完成${scenarioHistory.length}道` : ''
        const weak = Object.entries(stats)
          .filter(([, s]) => s.total > 0)
          .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)
          .slice(0, 3).map(([c]) => c)
        apiMessage = `学员请求薄弱点分析。知识类答题数据：\n${statsText}${scenStats}\n\n${weak.length > 0 ? `最需要加强：${weak.join('、')}` : '暂无明显薄弱项'}\n\n请按薄弱点分析格式输出报告，分析结束后不出新题。`
      } else {
        const weakest = Object.entries(stats)
          .filter(([, s]) => s.total > 0)
          .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)[0]?.[0]
          ?? findWeakestCompetency(answerHistory)
        if (weakest) { setCurrentCompetency(weakest); apiMessage = `请针对最薄弱能力项${weakest}出一道题。` }
      }
    } else if (intent === 'report') {
      apiMessage = buildAutoReportPrompt(answerHistory, answerHistory.length)
    }

    const newHistory: APIMessage[] = [...curHistory, { role: 'user', content: apiMessage }]

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSubmittingAnswer: false,
          level,
          mode: /知识题|知识类题|单选题/.test(userText) ? 'knowledge' : mode,
          competency: currentCompetency,
          userMessage: apiMessage,
          conversationHistory: curHistory,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '请求失败')

      const content: string = data.content
      const type = detectMessageType(content)

      if (type === 'question') setQuestionCount(n => n + 1)

      if (type === 'explanation') {
        const isScenario = false // 正常路径下不会直接得到解析
        const questionType: 'knowledge' | 'sjt' = isScenario ? 'sjt' : 'knowledge'
        const correctAnswer = questionType === 'knowledge' ? parseCorrectAnswer(content) : null
        const isCorrect = correctAnswer
          ? userText.trim().toUpperCase() === correctAnswer
          : null
        const comp = currentCompetency || '综合'

        const newAnswer: LocalAnswer = {
          competency: comp,
          questionType,
          userAnswer: userText,
          isCorrect,
        }
        setAnswerHistory(prev => [...prev, newAnswer])

        supabase.from('practice_records').insert({
          session_id: sessionId,
          level,
          question_type: questionType,
          competency: comp,
          user_answer: userText,
          is_correct: isCorrect ?? null,
        }).then(({ error }) => {
          if (error) console.warn('practice_records insert error:', error.message)
        })

        if (questionType === 'sjt') {
          const lastQ = [...messages].reverse().find(m => m.type === 'question')
          const newScenario: ScenarioInteraction = {
            question: lastQ?.content ?? '',
            userAnswer: userText,
            explanation: content,
            competency: comp,
          }
          setScenarioHistory(prev => [...prev, newScenario])
        }
      }

      const aiMsg: Message = { id: uid(), role: 'assistant', type, content }
      setMessages(prev => [...prev, aiMsg])
      const updated: APIMessage[] = [...newHistory, { role: 'assistant' as const, content }]
      setHistory(updated)
      historyRef.current = updated

      // 报告/分析响应后强制重置答题等待状态，防止 AI 偷加题目触发 isWaiting
      if (intent === 'weak' || intent === 'report') {
        setIsWaiting(false)
      }
    } catch {
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant', type: 'assistant',
        content: '抱歉，出现了网络错误，请稍后重试。',
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  async function sendSystemTrigger(prompt: string) {
    if (loading) return
    setLoading(true)
    const curHistory = historyRef.current
    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSubmittingAnswer: false,
          level, mode, competency: currentCompetency,
          userMessage: prompt,
          conversationHistory: curHistory,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const content: string = data.content
        const type = detectMessageType(content)
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', type, content }])
        const updated: APIMessage[] = [
          ...curHistory,
          { role: 'user' as const, content: prompt },
          { role: 'assistant' as const, content },
        ]
        setHistory(updated)
        historyRef.current = updated
        // 自动触发的报告/分析后同样强制重置答题等待状态
        setIsWaiting(false)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const placeholder = isWaiting ? '输入你的答案（填字母，如：A 或 最佳A最差C）' : '输入消息或指定出题需求…'

  const quickButtons = [
    { label: '下一题', msg: '下一题' },
    { label: '再出一道情景题', msg: '请再出一道情景题', hidden: level === 'ACC' || mode === 'knowledge' },
    { label: '分析薄弱点', msg: '分析我的薄弱点' },
    { label: '出CC7的题', msg: '请出一道CC7（唤起觉察）相关的题目' },
  ].filter(b => !b.hidden)

  const levelBadge = LEVEL_COLORS[level]
  const competencyLabel = currentCompetency ? (COMPETENCY_LABELS[currentCompetency] ?? currentCompetency) : null

  // 历史统计面板数据
  const historyStats = (() => {
    const kTotal = answerHistory.filter(a => a.questionType === 'knowledge').length
    const sTotal = answerHistory.filter(a => a.questionType === 'sjt').length
    const kCorrect = answerHistory.filter(a => a.questionType === 'knowledge' && a.isCorrect === true).length
    const compMap: Record<string, number> = {}
    for (const a of answerHistory) {
      compMap[a.competency] = (compMap[a.competency] || 0) + 1
    }
    const compList = Object.entries(compMap).sort((a, b) => b[1] - a[1])
    return { kTotal, sTotal, kCorrect, total: answerHistory.length, compList }
  })()

  return (
    <div className="relative flex flex-col h-[calc(100vh-80px)]">
      {/* History panel overlay */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-black/30 flex items-start justify-center pt-16 px-4"
          onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[var(--foreground)]">本 Session 答题记录</h3>
              <button onClick={() => setShowHistory(false)}
                className="text-[var(--text-muted)] hover:text-[var(--foreground)] text-lg leading-none">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">累计练习</span>
                <span className="font-medium">{historyStats.total} 题</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">知识类</span>
                <span className="font-medium">{historyStats.kTotal} 题</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">情景类</span>
                <span className="font-medium">{historyStats.sTotal} 题</span>
              </div>
              {historyStats.kTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">知识类正确率</span>
                  <span className="font-medium text-green-600">
                    {Math.round(historyStats.kCorrect / historyStats.kTotal * 100)}%
                    （{historyStats.kCorrect}/{historyStats.kTotal}）
                  </span>
                </div>
              )}
            </div>
            {historyStats.compList.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">能力项分布</p>
                <div className="space-y-1">
                  {historyStats.compList.map(([comp, count]) => (
                    <div key={comp} className="flex items-center gap-2">
                      <span className="text-xs text-[var(--foreground)] w-20 shrink-0">{comp}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className="bg-[var(--primary)] h-1.5 rounded-full"
                          style={{ width: `${Math.round(count / historyStats.total * 100)}%` }} />
                      </div>
                      <span className="text-xs text-[var(--text-muted)] w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {historyStats.total === 0 && (
              <p className="text-sm text-[var(--text-muted)] text-center py-2">暂无答题记录</p>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between py-3 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${levelBadge}`}>{level}</span>
          {studentName && (
            <span className="text-xs text-[var(--foreground)] font-medium">{studentName}</span>
          )}
          {(() => {
            const { kTotal, kCorrect, total } = historyStats
            return (
              <>
                <span className="text-xs text-[var(--text-muted)]">已练{total}题</span>
                {kTotal > 0 && (
                  <span className="text-xs text-green-600">
                    知识类正确率{Math.round(kCorrect / kTotal * 100)}%
                  </span>
                )}
              </>
            )
          })()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(true)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded"
          >
            历史记录
          </button>
          <button
            onClick={onReset}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded"
          >
            重新选择
          </button>
          <button
            onClick={onLogout}
            className="text-xs text-[var(--text-muted)] hover:text-red-500 transition-colors px-2 py-1 rounded"
          >
            退出
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 px-1">
        {messages.length === 0 && (
          <div className="flex justify-center items-center h-full">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--surface)] pt-3 pb-4 space-y-2">
        <div className="flex gap-2 flex-wrap px-1">
          {quickButtons.map(btn => (
            <button
              key={btn.label}
              onClick={() => sendMessage(btn.msg)}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all disabled:opacity-40 bg-white"
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end px-1">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={loading}
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 border-2 border-[var(--border)] rounded-xl text-sm focus:outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="btn-primary px-4 py-2.5 flex-shrink-0"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findWeakestCompetency(answers: LocalAnswer[]): string | null {
  const stats: Record<string, { total: number; wrong: number }> = {}
  for (const a of answers) {
    if (a.questionType !== 'knowledge') continue
    if (!stats[a.competency]) stats[a.competency] = { total: 0, wrong: 0 }
    stats[a.competency].total++
    if (a.isCorrect === false) stats[a.competency].wrong++
  }
  const entries = Object.entries(stats).filter(([, s]) => s.total > 0)
  if (entries.length === 0) return null
  return entries.sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)[0][0]
}

// ─── Client Page ──────────────────────────────────────────────────────────────

export default function ClientPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'selection' | 'chat'>('selection')
  const [config, setConfig] = useState<{ level: Level; mode: Mode; competency: string | null } | null>(null)
  const [studentName, setStudentName] = useState('')
  const [activatedLevel, setActivatedLevel] = useState<Level | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('activation_data')
    if (!raw) { router.push('/'); return }
    try {
      const { name, level, expiresAt } = JSON.parse(raw)
      if (new Date() > new Date(expiresAt)) {
        localStorage.removeItem('activation_data')
        router.push('/')
        return
      }
      setStudentName(name || '')
      setActivatedLevel(level || null)
    } catch {
      localStorage.removeItem('activation_data')
      router.push('/')
    }
  }, [router])

  function handleLogout() {
    localStorage.removeItem('activation_data')
    router.push('/')
  }

  function handleStart(level: Level, mode: Mode, competency: string | null) {
    setConfig({ level, mode, competency })
    setPhase('chat')
  }

  if (phase === 'chat' && config) {
    return (
      <ChatScreen
        level={config.level}
        mode={config.mode}
        competency={config.competency}
        studentName={studentName}
        onReset={() => { setConfig(null); setPhase('selection') }}
        onLogout={handleLogout}
      />
    )
  }

  if (!activatedLevel) return null

  return <SelectionScreen level={activatedLevel} onStart={handleStart} />
}
