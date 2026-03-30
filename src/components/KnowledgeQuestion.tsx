'use client'

import { Question } from '@/types'

interface Props {
  question: Question
  userAnswer: string | null
  correctAnswer?: string
  onAnswer: (answer: string) => void
  disabled: boolean
  submitting: boolean
}

export default function KnowledgeQuestion({
  question,
  userAnswer,
  correctAnswer,
  onAnswer,
  disabled,
  submitting,
}: Props) {
  function getOptionClass(key: string): string {
    let cls = 'option-btn '
    if (!disabled) return cls
    if (key === correctAnswer) return cls + 'correct'
    if (key === userAnswer && key !== correctAnswer) return cls + 'wrong'
    if (key === userAnswer) return cls + 'selected'
    return cls
  }

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
          单选题
        </span>
        <span className="text-xs text-[var(--text-muted)]">{question.topic}</span>
      </div>

      <p className="text-[var(--foreground)] text-base leading-relaxed font-medium">
        {question.content}
      </p>

      <div className="space-y-2.5">
        {question.options.map((opt) => (
          <button
            key={opt.key}
            className={getOptionClass(opt.key)}
            onClick={() => !disabled && onAnswer(opt.key)}
            disabled={disabled || submitting}
          >
            <span className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
              userAnswer === opt.key
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : 'border-gray-300 text-gray-500'
            }`}>
              {opt.key}
            </span>
            <span className="flex-1">{opt.text}</span>
          </button>
        ))}
      </div>

      {submitting && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          提交中...
        </div>
      )}
    </div>
  )
}
