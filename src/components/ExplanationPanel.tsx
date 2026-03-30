'use client'

import { Option, QuestionType } from '@/types'

interface Props {
  isCorrect: boolean
  explanation: string
  correctAnswer?: string
  correctRanking?: string[]
  optionExplanations?: Record<string, string>
  options: Option[]
  icfReference?: string
  questionType: QuestionType
  onNext: () => void
}

export default function ExplanationPanel({
  isCorrect,
  explanation,
  correctAnswer,
  correctRanking,
  optionExplanations,
  options,
  icfReference,
  questionType,
  onNext,
}: Props) {
  return (
    <div className="card space-y-5">
      {/* Result badge */}
      <div className={`flex items-center gap-3 p-4 rounded-xl ${
        isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
      }`}>
        <span className={`text-2xl ${isCorrect ? '' : ''}`}>
          {isCorrect ? '✓' : '✗'}
        </span>
        <div>
          <p className={`font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {isCorrect ? '回答正确' : '回答有误'}
          </p>
          {!isCorrect && questionType === 'knowledge' && correctAnswer && (
            <p className="text-sm text-red-600 mt-0.5">
              正确答案：<strong>{correctAnswer}</strong>
            </p>
          )}
          {!isCorrect && questionType === 'sjt' && correctRanking && (
            <p className="text-sm text-red-600 mt-0.5">
              最佳排序：<strong>{correctRanking.join(' → ')}</strong>
            </p>
          )}
        </div>
      </div>

      {/* SJT Ranking breakdown */}
      {questionType === 'sjt' && correctRanking && optionExplanations && (
        <div>
          <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">选项排序解析</h4>
          <div className="space-y-2">
            {correctRanking.map((key, index) => {
              const opt = options.find((o) => o.key === key)
              const rankLabels = ['最佳', '次佳', '较差', '最差']
              return (
                <div key={key} className="flex gap-3 text-sm">
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      index === 0 ? 'bg-green-500' :
                      index === 1 ? 'bg-blue-500' :
                      index === 2 ? 'bg-orange-400' : 'bg-red-500'
                    }`}>
                      {key}
                    </span>
                    <span className={`text-xs font-medium ${
                      index === 0 ? 'text-green-600' :
                      index === 1 ? 'text-blue-600' :
                      index === 2 ? 'text-orange-500' : 'text-red-500'
                    }`}>
                      {rankLabels[index]}
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="font-medium text-[var(--foreground)] mb-1">{opt?.text}</p>
                    <p className="text-[var(--text-muted)] text-xs leading-relaxed">
                      {optionExplanations[key]}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Overall explanation */}
      <div>
        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">解析</h4>
        <p className="text-sm text-[var(--foreground)] leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
          {explanation}
        </p>
      </div>

      {/* ICF Reference */}
      {icfReference && (
        <div className="flex items-start gap-2 text-xs text-[var(--text-muted)] bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
          <span className="text-amber-600 font-semibold flex-shrink-0">ICF依据</span>
          <span>{icfReference}</span>
        </div>
      )}

      <button onClick={onNext} className="btn-primary w-full">
        下一题 →
      </button>
    </div>
  )
}
