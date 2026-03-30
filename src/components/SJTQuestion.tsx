'use client'

import { useState } from 'react'
import { Question } from '@/types'

interface Props {
  question: Question
  userRanking: string[] | null
  correctRanking?: string[]
  onAnswer: (ranking: string[]) => void
  disabled: boolean
  submitting: boolean
}

export default function SJTQuestion({
  question,
  userRanking,
  correctRanking,
  onAnswer,
  disabled,
  submitting,
}: Props) {
  const [ranking, setRanking] = useState<string[]>([])

  function toggleOption(key: string) {
    if (disabled) return
    setRanking((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key)
      }
      return [...prev, key]
    })
  }

  function handleSubmit() {
    if (ranking.length === question.options.length) {
      onAnswer(ranking)
    }
  }

  const displayRanking = userRanking ?? ranking
  const allSelected = displayRanking.length === question.options.length

  function getRankLabel(key: string): number | null {
    const idx = displayRanking.indexOf(key)
    return idx >= 0 ? idx + 1 : null
  }

  function getOptionClass(key: string): string {
    let base = 'option-btn '
    if (!disabled) {
      return base + (displayRanking.includes(key) ? 'selected' : '')
    }
    // Show correct vs wrong after answer
    const userRank = userRanking?.indexOf(key) ?? -1
    const correctRank = correctRanking?.indexOf(key) ?? -1
    if (userRank === correctRank) return base + 'correct'
    if (Math.abs(userRank - correctRank) <= 1) return base + 'selected' // close enough
    return base + 'wrong'
  }

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full">
          情景题
        </span>
        <span className="text-xs text-[var(--text-muted)]">{question.topic}</span>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-[var(--foreground)] text-sm leading-relaxed">
          {question.content}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--foreground)] mb-3">
          请将以下选项从<strong>最佳到最差</strong>排序（依次点击）：
        </p>
        {!disabled && displayRanking.length < question.options.length && (
          <p className="text-xs text-[var(--text-muted)] mb-3">
            已选 {displayRanking.length}/{question.options.length}，
            {displayRanking.length === 0 ? '点击第1个最佳选项' : `继续点击第${displayRanking.length + 1}个选项`}
          </p>
        )}

        <div className="space-y-2.5">
          {question.options.map((opt) => {
            const rank = getRankLabel(opt.key)
            return (
              <button
                key={opt.key}
                className={getOptionClass(opt.key)}
                onClick={() => toggleOption(opt.key)}
                disabled={disabled || submitting}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                  rank !== null
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                    : 'border-gray-300 text-gray-500'
                }`}>
                  {rank !== null ? rank : opt.key}
                </span>
                <span className="flex-1">{opt.text}</span>
                {rank !== null && (
                  <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
                    {rank === 1 ? '最佳' : rank === question.options.length ? '最差' : `第${rank}`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {!disabled && (
        <button
          onClick={handleSubmit}
          className="btn-primary w-full"
          disabled={!allSelected || submitting}
        >
          {submitting ? '提交中...' : allSelected ? '提交排序' : `还需选择 ${question.options.length - displayRanking.length} 个`}
        </button>
      )}
    </div>
  )
}
