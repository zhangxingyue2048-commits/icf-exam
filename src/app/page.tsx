'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ActivationForm from '@/components/ActivationForm'
import LevelSelector from '@/components/LevelSelector'
import { ExamLevel } from '@/types'

type AppState = 'activation' | 'level_selection'

export default function HomePage() {
  const router = useRouter()
  const [appState, setAppState] = useState<AppState>('activation')
  const [pendingCode, setPendingCode] = useState('')
  const [pendingName, setPendingName] = useState('')

  function handleActivationSuccess(data: { session_id: string; exam_level: ExamLevel; student_name: string }) {
    const expiresAt = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
    localStorage.setItem('activation_data', JSON.stringify({
      name: data.student_name,
      level: data.exam_level,
      expiresAt,
    }))
    router.push('/practice')
  }

  function handleNeedsLevelSelection(code: string, student_name: string) {
    setPendingCode(code)
    setPendingName(student_name)
    setAppState('level_selection')
  }

  return (
    <div>
      {appState === 'activation' && (
        <ActivationForm
          onSuccess={handleActivationSuccess}
          onNeedsLevel={handleNeedsLevelSelection}
        />
      )}
      {appState === 'level_selection' && (
        <LevelSelector
          activationCode={pendingCode}
          studentName={pendingName}
          onSuccess={handleActivationSuccess}
        />
      )}
    </div>
  )
}
