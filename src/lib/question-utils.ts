import { Question, QuestionRow, ExamLevel } from '@/types'

/**
 * 将题库行（QuestionRow）转换为运行时 Question 格式
 */
export function rowToQuestion(row: QuestionRow): Question {
  const levels: ExamLevel[] =
    row.level === 'ALL'
      ? ['ACC', 'PCC', 'MCC']
      : [row.level as ExamLevel]

  const options = [
    { key: 'A', text: row.option_a },
    { key: 'B', text: row.option_b },
    { key: 'C', text: row.option_c },
    { key: 'D', text: row.option_d },
  ]

  const correct_ranking = row.ranking
    ? row.ranking.split(',').map((s) => s.trim())
    : undefined

  return {
    id: `db-${row.id}`,
    type: row.question_type,
    level: levels,
    topic: row.competency ?? '综合',
    content: row.scenario,
    options,
    correct_answer: row.best_answer ?? undefined,
    correct_ranking,
    explanation: row.explanation ?? '',
    icf_reference: row.competency ?? '',
    source: 'db',
    db_id: row.id,
  }
}
