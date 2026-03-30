import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { chat } from '@/lib/deepseek'
import { buildKnowledgeQuestionPrompt, buildSJTQuestionPrompt, selectQuestionType } from '@/lib/prompts'
import { rowToQuestion } from '@/lib/question-utils'
import { ExamLevel, Question, QuestionRow } from '@/types'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  const { session_id, exam_level, question_index = 0 } = await req.json()

  if (!session_id || !exam_level) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 验证会话
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .single()

  if (!session) {
    return NextResponse.json({ error: '会话无效' }, { status: 403 })
  }

  await supabase
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session_id)

  // 确定本次题型
  const questionType = selectQuestionType(exam_level as ExamLevel, question_index)

  // 已答过的题库题 id（避免重复）
  const { data: answered } = await supabase
    .from('answer_records')
    .select('question_id')
    .eq('session_id', session_id)

  const answeredDbIds = (answered ?? [])
    .map((r) => r.question_id)
    .filter((id: string) => id.startsWith('db-'))
    .map((id: string) => parseInt(id.replace('db-', ''), 10))

  // ── 优先从题库取题 ─────────────────────────────────────
  const { data: dbRows } = await supabase
    .from('questions')
    .select('*')
    .eq('question_type', questionType)
    .in('level', [exam_level, 'ALL'])
    .not('id', 'in', answeredDbIds.length > 0 ? `(${answeredDbIds.join(',')})` : '(-1)')
    .limit(20)

  if (dbRows && dbRows.length > 0) {
    // 随机取一道
    const row = dbRows[Math.floor(Math.random() * dbRows.length)] as QuestionRow
    return NextResponse.json({ question: rowToQuestion(row), source: 'db' })
  }

  // ── 题库已出完，降级到 DeepSeek AI 生成 ───────────────
  const { data: recentAnswers } = await supabase
    .from('answer_records')
    .select('question_topic')
    .eq('session_id', session_id)
    .order('answered_at', { ascending: false })
    .limit(5)

  const recentTopics = recentAnswers?.map((a: { question_topic: string }) => a.question_topic) ?? []

  const prompt =
    questionType === 'knowledge'
      ? buildKnowledgeQuestionPrompt(exam_level as ExamLevel, recentTopics)
      : buildSJTQuestionPrompt(exam_level as ExamLevel, recentTopics)

  const raw = await chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.8, max_tokens: 1500 }
  )

  type RawQuestion = Partial<Question> & { option_explanations?: Record<string, string> }
  let questionData: RawQuestion
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    questionData = JSON.parse(jsonMatch[0]) as RawQuestion
  } catch {
    return NextResponse.json({ error: '题目生成失败，请重试' }, { status: 500 })
  }

  const baseOptions = questionData.options ?? []
  const enrichedOptions = questionData.option_explanations
    ? baseOptions.map((opt) => ({ ...opt, explanation: questionData.option_explanations?.[opt.key] }))
    : baseOptions

  const question: Question = {
    id: uuidv4(),
    type: questionType,
    level: [exam_level as ExamLevel],
    topic: questionData.topic ?? '综合',
    content: questionData.content ?? '',
    options: enrichedOptions,
    correct_answer: questionData.correct_answer,
    correct_ranking: questionData.correct_ranking,
    explanation: questionData.explanation ?? '',
    icf_reference: questionData.icf_reference ?? '',
    source: 'ai',
  }

  return NextResponse.json({ question, source: 'ai' })
}
