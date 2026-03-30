'use client'

import { useState, useEffect } from 'react'
import { ExamLevel, StudyReport } from '@/types'

interface Props {
  sessionId: string
  examLevel: ExamLevel
  onClose: () => void
}

export default function StudyReportModal({ sessionId, examLevel, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<StudyReport | null>(null)
  const [aiFeedback, setAiFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '报告生成失败')
        setReport(data.report)
        setAiFeedback(data.ai_feedback)
      } catch (e) {
        setError(e instanceof Error ? e.message : '未知错误')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [sessionId])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-[var(--border)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-[var(--foreground)]">阶段学习报告</h3>
            <p className="text-xs text-[var(--text-muted)]">每10题自动生成 · {examLevel} 备考</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">正在生成学习报告...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-6">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {report && !loading && (
            <>
              {/* Score summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-4 bg-[var(--primary)] rounded-xl text-white">
                  <div className="text-2xl font-bold">{report.accuracy_rate}%</div>
                  <div className="text-xs mt-1 opacity-80">正确率</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <div className="text-2xl font-bold text-green-600">{report.correct_count}</div>
                  <div className="text-xs mt-1 text-green-600">答对</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <div className="text-2xl font-bold text-red-500">{report.total_questions - report.correct_count}</div>
                  <div className="text-xs mt-1 text-red-500">答错</div>
                </div>
              </div>

              {/* Topic breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">话题分析</h4>
                <div className="space-y-2">
                  {Object.entries(report.topic_stats).map(([topic, stats]) => {
                    const rate = Math.round((stats.correct / stats.total) * 100)
                    const isWeak = rate < 60
                    return (
                      <div key={topic} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--foreground)] w-24 flex-shrink-0 truncate">{topic}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${isWeak ? 'bg-red-400' : 'bg-green-400'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium w-10 text-right ${isWeak ? 'text-red-500' : 'text-green-600'}`}>
                          {rate}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Weak topics */}
              {report.weak_topics.length > 0 && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-orange-700 mb-2">需要加强</h4>
                  <div className="flex flex-wrap gap-2">
                    {report.weak_topics.map((t) => (
                      <span key={t} className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI feedback */}
              {aiFeedback && (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">AI学习建议</h4>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                    {aiFeedback}
                  </div>
                </div>
              )}

              <button onClick={onClose} className="btn-primary w-full">
                继续练习
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
