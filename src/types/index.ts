export type ExamLevel = 'ACC' | 'PCC' | 'MCC'

export type QuestionType = 'knowledge' | 'sjt'

export type Competency = 'CC1' | 'CC2' | 'CC3' | 'CC4' | 'CC5' | 'CC6' | 'CC7' | 'CC8' | 'Ethics' | string

export interface ActivationCode {
  id: string
  code: string
  student_name: string | null
  is_used: boolean
  browser_fingerprint: string | null
  activated_at: string | null
  expires_at: string | null
  exam_level: ExamLevel | null
  session_id: string | null
  created_at: string
}

export interface Session {
  id: string
  activation_code_id: string
  exam_level: ExamLevel
  browser_fingerprint: string
  active_tab_token: string | null
  started_at: string
  last_active_at: string
}

/** 题库表中的原始行 */
export interface QuestionRow {
  id: number
  question_no: string
  question_type: QuestionType
  level: 'ACC' | 'PCC' | 'MCC' | 'ALL'
  competency: Competency | null
  scenario: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  best_answer: string | null
  worst_answer: string | null
  ranking: string | null       // 'B,A,D,C'
  explanation: string | null
  created_at: string
}

/** 运行时题目（统一结构，题库题和AI生成题共用） */
export interface Question {
  id: string
  type: QuestionType
  level: ExamLevel[]
  topic: string                  // competency 标签，如 CC3、Ethics
  content: string
  options: Option[]
  correct_answer?: string        // knowledge 正确答案键
  correct_ranking?: string[]     // SJT 最佳到最差排序
  explanation: string
  icf_reference: string
  source?: 'db' | 'ai'          // 来源标记
  db_id?: number                 // 题库题目的原始 id
}

export interface Option {
  key: string
  text: string
  explanation?: string           // SJT 每个选项的单独解析
}

export interface AnswerRecord {
  id: string
  session_id: string
  question_id: string
  question_type: QuestionType
  question_topic: string
  user_answer: string | string[]
  is_correct: boolean
  answered_at: string
  question_snapshot: Question
}

export interface LearningTrack {
  id: number
  session_id: string
  competency: Competency
  correct_count: number
  wrong_count: number
  updated_at: string
}

export interface StudyReport {
  total_questions: number
  correct_count: number
  accuracy_rate: number
  weak_topics: string[]
  topic_stats: Record<string, { total: number; correct: number }>
  competency_stats: Record<string, { correct: number; wrong: number }>
  generated_at: string
}

export interface QuestionRequest {
  session_id: string
  exam_level: ExamLevel
  question_index?: number
}

export interface AnswerRequest {
  session_id: string
  question: Question
  user_answer: string | string[]
}

export interface AnswerResponse {
  is_correct: boolean
  explanation: string
  correct_answer?: string
  correct_ranking?: string[]
  option_explanations?: Record<string, string>
  icf_reference?: string
  should_generate_report: boolean
  total_answered: number | null
}
