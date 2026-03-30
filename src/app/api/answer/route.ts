import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Question } from '@/types'

function checkAnswer(question: Question, userAnswer: string | string[]): boolean {
  if (question.type === 'knowledge') {
    return question.correct_answer === userAnswer
  }
  if (Array.isArray(userAnswer) && question.correct_ranking) {
    return userAnswer.join(',') === question.correct_ranking.join(',')
  }
  return false
}

export async function POST(req: NextRequest) {
  const { session_id, question, user_answer } = await req.json()

  if (!session_id || !question || user_answer === undefined) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: '会话无效' }, { status: 403 })
  }

  const is_correct = checkAnswer(question, user_answer)
  const competency: string = question.topic ?? '综合'

  // 并行：写答题记录 + upsert learning_tracks
  await Promise.all([
    supabase.from('answer_records').insert({
      session_id,
      question_id: question.id,
      question_type: question.type,
      question_topic: competency,
      user_answer: Array.isArray(user_answer) ? user_answer.join(',') : user_answer,
      is_correct,
      answered_at: new Date().toISOString(),
      question_snapshot: question,
    }),
    supabase.rpc('upsert_learning_track', {
      p_session_id: session_id,
      p_competency: competency,
      p_correct: is_correct,
    }),
  ])

  // 检查是否到10题里程碑
  const { count } = await supabase
    .from('answer_records')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)

  const should_generate_report = count !== null && count % 10 === 0

  return NextResponse.json({
    is_correct,
    explanation: question.explanation,
    correct_answer: question.correct_answer,
    correct_ranking: question.correct_ranking,
    option_explanations:
      question.type === 'sjt'
        ? Object.fromEntries(
            question.options.map((o: { key: string; explanation?: string }) => [o.key, o.explanation ?? ''])
          )
        : undefined,
    icf_reference: question.icf_reference,
    should_generate_report,
    total_answered: count,
  })
}
