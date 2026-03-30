'use client'

import { useState } from 'react'
import { getBrowserFingerprint } from '@/lib/fingerprint'
import { ExamLevel } from '@/types'

interface Props {
  onSuccess: (data: { session_id: string; exam_level: ExamLevel; student_name: string }) => void
  onNeedsLevel: (code: string, student_name: string) => void
}

export default function ActivationForm({ onSuccess, onNeedsLevel }: Props) {
  const [code, setCode] = useState('')
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (val.startsWith('ICF') && !val.startsWith('ICF-') && val.length > 3) {
      val = 'ICF-' + val.slice(3)
    }
    if (val.length > 10) val = val.slice(0, 10)
    setCode(val)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !studentName.trim()) return

    setLoading(true)
    setError('')

    try {
      const fingerprint = await getBrowserFingerprint()
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          student_name: studentName.trim(),
          fingerprint,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '验证失败，请重试')
        return
      }

      if (data.needs_level_selection) {
        onNeedsLevel(code.trim(), studentName.trim())
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

  const canSubmit = code.length === 10 && studentName.trim().length >= 2

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)] flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">ICF</span>
          </div>
          <h2 className="text-2xl font-bold text-[var(--foreground)]">欢迎使用备考平台</h2>
          <p className="text-[var(--text-muted)] mt-2 text-sm">请输入激活码和真实姓名开始练习</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              真实姓名
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => { setStudentName(e.target.value); setError('') }}
              placeholder="请输入您的真实姓名"
              className="w-full px-4 py-3 border-2 border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--primary)] transition-colors"
              disabled={loading}
              autoFocus
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              激活码
            </label>
            <input
              type="text"
              value={code}
              onChange={handleCodeChange}
              placeholder="ICF-XXXXXX"
              className="w-full px-4 py-3 border-2 border-[var(--border)] rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:border-[var(--primary)] transition-colors"
              disabled={loading}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1.5">格式：ICF-XXXXXX（6位字母数字）</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !canSubmit}
          >
            {loading ? '验证中...' : '开始备考'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          激活码与设备绑定，有效期6个月，仅限单设备使用
        </p>
      </div>
    </div>
  )
}
