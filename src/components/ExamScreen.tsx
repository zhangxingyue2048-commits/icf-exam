'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ExamLevel, Question } from '@/types'
import KnowledgeQuestion from './KnowledgeQuestion'
import SJTQuestion from './SJTQuestion'
import ExplanationPanel from './ExplanationPanel'
import StudyReportModal from './StudyReportModal'

interface Props {
  sessionId: string
  examLevel: ExamLevel
  studentName: string
}

type ScreenState = 'loading' | 'question' | 'explanation' | 'error' | 'kicked'

interface AnswerResult {
  is_correct: boolean
  explanation: string
  correct_answer?: string
  correct_ranking?: string[]
  option_explanations?: Record<string, string>
  icf_reference?: string
  should_generate_report: boolean
  total_answered: number
}

// 生成当前标签页唯一token
function generateTabToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const HEARTBEAT_INTERVAL = 30_000 // 30秒

export default function ExamScreen({ sessionId, examLevel, studentName }: Props) {
  const [state, setState] = useState<ScreenState>('loading')
  const [question, setQuestion] = useState<Question | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState<string | string[] | null>(null)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 每个标签页唯一token，组件生命周期内固定
  const tabToken = useRef<string>(generateTabToken())

  // 心跳：定期向服务端报告本标签页存活，被踢则切到kicked状态
  useEffect(() => {
    if (!sessionId) return

    async function sendHeartbeat() {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, tab_token: tabToken.current }),
        })
        const data = await res.json()
        if (data.kicked) {
          setState('kicked')
        }
      } catch {
        // 网络抖动不做处理，下次心跳再试
      }
    }

    // 立即抢占 active_tab_token
    sendHeartbeat()

    const timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
    return () => clearInterval(timer)
  }, [sessionId])

  const loadNextQuestion = useCallback(async () => {
    setState('loading')
    setUserAnswer(null)
    setAnswerResult(null)

    try {
      const res = await fetch('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          exam_level: examLevel,
          question_index: questionIndex,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '获取题目失败')

      setQuestion(data.question)
      setState('question')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '未知错误')
      setState('error')
    }
  }, [sessionId, examLevel, questionIndex])

  useEffect(() => {
    // 被踢时不加载新题
    if (state !== 'kicked') {
      loadNextQuestion()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex])

  // 初始加载
  useEffect(() => {
    loadNextQuestion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmitAnswer(answer: string | string[]) {
    if (!question || submitting) return
    setSubmitting(true)
    setUserAnswer(answer)

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, question, user_answer: answer }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '提交失败')

      setAnswerResult(data)
      setState('explanation')

      if (data.should_generate_report) {
        setShowReport(true)
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '提交失败')
      setState('error')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNextQuestion() {
    setQuestionIndex((i) => i + 1)
  }

  const levelBadgeColor = {
    ACC: 'bg-blue-100 text-blue-700',
    PCC: 'bg-purple-100 text-purple-700',
    MCC: 'bg-amber-100 text-amber-700',
  }[examLevel]

  // ── 被踢出 ──────────────────────────────────────────────
  if (state === 'kicked') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="card w-full max-w-md text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">已在其他窗口登录</h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            您的账号在另一个标签页或窗口中打开了练习。<br />
            每次只能在一个窗口中使用本平台。
          </p>
          <button
            className="btn-primary w-full"
            onClick={() => window.location.reload()}
          >
            在此窗口继续使用
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${levelBadgeColor}`}>
            {examLevel} 备考
          </span>
          <span className="text-xs text-[var(--text-muted)]">{studentName}</span>
        </div>
        <span className="text-sm text-[var(--text-muted)]">第 {questionIndex + 1} 题</span>
      </div>

      {/* Loading */}
      {state === 'loading' && (
        <div className="card flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-muted)]">正在生成题目...</p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="card text-center py-12">
          <p className="text-red-600 mb-4">{errorMsg}</p>
          <button onClick={loadNextQuestion} className="btn-primary">
            重新加载
          </button>
        </div>
      )}

      {/* Question */}
      {(state === 'question' || state === 'explanation') && question && (
        <>
          {question.type === 'knowledge' ? (
            <KnowledgeQuestion
              question={question}
              userAnswer={userAnswer as string | null}
              correctAnswer={answerResult?.correct_answer}
              onAnswer={handleSubmitAnswer}
              disabled={state === 'explanation' || submitting}
              submitting={submitting}
            />
          ) : (
            <SJTQuestion
              question={question}
              userRanking={userAnswer as string[] | null}
              correctRanking={answerResult?.correct_ranking}
              onAnswer={handleSubmitAnswer}
              disabled={state === 'explanation' || submitting}
              submitting={submitting}
            />
          )}

          {state === 'explanation' && answerResult && (
            <ExplanationPanel
              isCorrect={answerResult.is_correct}
              explanation={answerResult.explanation}
              correctAnswer={answerResult.correct_answer}
              correctRanking={answerResult.correct_ranking}
              optionExplanations={answerResult.option_explanations}
              options={question.options}
              icfReference={answerResult.icf_reference}
              questionType={question.type}
              onNext={handleNextQuestion}
            />
          )}
        </>
      )}

      {showReport && (
        <StudyReportModal
          sessionId={sessionId}
          examLevel={examLevel}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
