-- ICF备考平台数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件

-- 激活码表
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,    -- ICF-XXXXXX
  student_name TEXT,                   -- 学员真实姓名（首次激活时写入）
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  browser_fingerprint TEXT,            -- 绑定的设备指纹
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  exam_level VARCHAR(3),               -- ACC / PCC / MCC
  session_id UUID,                     -- 关联的会话ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_code_id UUID NOT NULL REFERENCES activation_codes(id),
  exam_level VARCHAR(3) NOT NULL,
  browser_fingerprint TEXT NOT NULL,
  active_tab_token TEXT,               -- 当前活跃标签页token，用于互踢
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 题库表
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  question_no TEXT NOT NULL,           -- Q01, Q02...
  question_type TEXT NOT NULL,         -- 'sjt' | 'knowledge'
  level TEXT NOT NULL,                 -- 'ACC' | 'PCC' | 'MCC' | 'ALL'
  competency TEXT,                     -- 'CC1'~'CC8' 或 'Ethics'
  scenario TEXT NOT NULL,              -- 情境描述（题目正文）
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  best_answer TEXT,                    -- 'A'|'B'|'C'|'D'（知识类正确答案）
  worst_answer TEXT,                   -- SJT 最差选项
  ranking TEXT,                        -- SJT 完整排序，如 'B,A,D,C'
  explanation TEXT,                    -- 整体解析
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 答题记录表
CREATE TABLE IF NOT EXISTS answer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  question_id TEXT NOT NULL,           -- 题库题目用 questions.id，AI题用 uuid
  question_type VARCHAR(10) NOT NULL,  -- knowledge / sjt
  question_topic TEXT NOT NULL,        -- competency 或 topic 标签
  user_answer TEXT NOT NULL,           -- 单选：'A'；SJT：'B,A,D,C'
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  question_snapshot JSONB NOT NULL     -- 完整题目快照
);

-- 学习追踪表（按能力维度统计）
CREATE TABLE IF NOT EXISTS learning_tracks (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  competency TEXT NOT NULL,            -- 'CC1'~'CC8' 或 'Ethics'
  correct_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, competency)       -- 每个会话每个能力维度只有一条记录
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_sessions_activation_code ON sessions(activation_code_id);
CREATE INDEX IF NOT EXISTS idx_answer_records_session ON answer_records(session_id);
CREATE INDEX IF NOT EXISTS idx_answer_records_answered_at ON answer_records(session_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_level_type ON questions(level, question_type);
CREATE INDEX IF NOT EXISTS idx_learning_tracks_session ON learning_tracks(session_id);

-- 禁用 RLS（通过 service_role key 操作）
ALTER TABLE activation_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE answer_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE learning_tracks DISABLE ROW LEVEL SECURITY;

-- 插入测试激活码（开发用）
INSERT INTO activation_codes (code) VALUES
  ('ICF-TEST01'),
  ('ICF-TEST02'),
  ('ICF-DEMO01')
ON CONFLICT (code) DO NOTHING;
