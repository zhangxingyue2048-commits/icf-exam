'use client'

import { useState } from 'react'
import { getBrowserFingerprint } from '@/lib/fingerprint'
import { ExamLevel } from '@/types'

interface Props {
  activationCode: string
  studentName: string
  onSuccess: (data: { session_id: string; exam_level: ExamLevel; student_name: string }) => void
}

const LEVELS: { id: ExamLevel; name: string; desc: string; details: string[] }[] = [
  {
    id: 'ACC',
    name: 'ACC',
    desc: '助理认证教练',
    details: ['知识类单选题', '道德准则 · 能力定义 · 边界判断', '500小时教练经验要求'],
  },
  {
    id: 'PCC',
    name: 'PCC',
    desc: '专业认证教练',
    details: ['知识类题 + 情景题', '四选项排序 · 情境分析', '500+小时教练经验要求'],
  },
  {
    id: 'MCC',
    name: 'MCC',
    desc: '大师认证教练',
    details: ['知识类题 + 高难度情景题', '复杂情境 · 多维权衡', '2500小时教练经验要求'],
  },
]

export default function LevelSelector({ activationCode, studentName, onSuccess }: Props) {
  const [selected, setSelected] = useState<ExamLevel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (!selected) return
    setLoading(true)
    setError('')

    try {
      const fingerprint = await getBrowserFingerprint()
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activationCode,
          student_name: studentName,
          fingerprint,
          exam_level: selected,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '激活失败，请重试')
        return
      }

      if (data.success) {
        onSuccess({
          session_id: data.session_id,
          exam_level: data.exam_level,
          student_name: data.student_name,
        })
      }
    } catch {
      setError('网络错误，请检查连接后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="card w-full max-w-lg">
        <div className="text-center mb-8">
          <p className="text-sm text-[var(--text-muted)]">你好，{studentName}</p>
          <h2 className="text-2xl font-bold text-[var(--foreground)] mt-1">选择备考级别</h2>
          <p className="text-[var(--text-muted)] mt-2 text-sm">请选择您正在备考的ICF认证级别</p>
        </div>

        <div className="space-y-3 mb-6">
          {LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => setSelected(level.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selected === level.id
                  ? 'border-[var(--primary)] bg-[#e8f0f8]'
                  : 'border-[var(--border)] hover:border-[var(--primary-light)] bg-white'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                  selected === level.id ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 text-[var(--primary)]'
                }`}>
                  {level.name}
                </div>
                <div>
                  <div className="font-semibold text-[var(--foreground)]">{level.name} — {level.desc}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {level.details.join(' · ')}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
          className="btn-primary w-full"
          disabled={!selected || loading}
        >
          {loading ? '激活中...' : '确认并开始练习'}
        </button>

        <p className="text-center text-xs text-[var(--text-muted)] mt-4">
          级别选择后不可更改，请谨慎选择
        </p>
      </div>
    </div>
  )
}
