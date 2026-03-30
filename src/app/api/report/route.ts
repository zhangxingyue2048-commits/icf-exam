import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { chat } from '@/lib/deepseek'
import { buildReportPrompt } from '@/lib/prompts'
import { ExamLevel, StudyReport } from '@/types'

export async function POST(req: NextRequest) {
  const { session_id } = await req.json()

  if (!session_id) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: '会话无效' }, { status: 403 })
  }

  // 最近10题答题记录
  const { data: answers } = await supabase
    .from('answer_records')
    .select('*')
    .eq('session_id', session_id)
    .order('answered_at', { ascending: false })
    .limit(10)

  if (!answers || answers.length === 0) {
    return NextResponse.json({ error: '暂无答题记录' }, { status: 400 })
  }

  // 按 topic 统计（最近10题）
  const topicStats: Record<string, { total: number; correct: number }> = {}
  for (const a of answers) {
    const topic = a.question_topic ?? '综合'
    if (!topicStats[topic]) topicStats[topic] = { total: 0, correct: 0 }
    topicStats[topic].total++
    if (a.is_correct) topicStats[topic].correct++
  }

  const correctCount = answers.filter((a) => a.is_correct).length
  const weakTopics = Object.entries(topicStats)
    .filter(([, s]) => s.correct / s.total < 0.6)
    .map(([topic]) => topic)

  // 全局 competency 维度统计（来自 learning_tracks）
  const { data: tracks } = await supabase
    .from('learning_tracks')
    .select('competency, correct_count, wrong_count')
    .eq('session_id', session_id)

  const competencyStats: Record<string, { correct: number; wrong: number }> = {}
  for (const t of tracks ?? []) {
    competencyStats[t.competency] = {
      correct: t.correct_count,
      wrong: t.wrong_count,
    }
  }

  // AI 生成学习建议
  const reportText = await chat(
    [{ role: 'user', content: buildReportPrompt(session.exam_level as ExamLevel, weakTopics, topicStats) }],
    { temperature: 0.6, max_tokens: 800 }
  )

  const report: StudyReport = {
    total_questions: answers.length,
    correct_count: correctCount,
    accuracy_rate: Math.round((correctCount / answers.length) * 100),
    weak_topics: weakTopics,
    topic_stats: topicStats,
    competency_stats: competencyStats,
    generated_at: new Date().toISOString(),
  }

  return NextResponse.json({ report, ai_feedback: reportText })
}
