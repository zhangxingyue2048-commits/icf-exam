import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ExamLevel } from '@/types'

const DEVICE_CONFLICT_MSG =
  '此激活码已在其他设备使用，如需更换设备请添加微信客服'

export async function POST(req: NextRequest) {
  try {
    return await handleActivate(req)
  } catch (e) {
    console.error('[activate] unhandled error:', e)
    return NextResponse.json({ error: '服务器内部错误，请稍后重试' }, { status: 500 })
  }
}

async function handleActivate(req: NextRequest) {
  const { code, student_name, fingerprint, exam_level } = await req.json()

  if (!code || !fingerprint || !student_name?.trim()) {
    return NextResponse.json({ error: '请填写激活码和真实姓名' }, { status: 400 })
  }

  if (!/^ICF-[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: '激活码格式不正确（格式：ICF-XXXXXX）' }, { status: 400 })
  }

  const name = student_name.trim()
  const supabase = createAdminClient()

  const { data: activation, error } = await supabase
    .from('activation_codes')
    .select('*')
    .eq('code', code)
    .single()

  if (error || !activation) {
    return NextResponse.json({ error: '激活码不存在，请确认后重试' }, { status: 404 })
  }

  // 已过期
  if (activation.expires_at && new Date(activation.expires_at) < new Date()) {
    return NextResponse.json({ error: '激活码已过期，请联系客服续期' }, { status: 403 })
  }

  // 已激活过
  if (activation.is_used) {
    // 不同设备 → 拒绝
    if (activation.browser_fingerprint !== fingerprint) {
      return NextResponse.json({ error: DEVICE_CONFLICT_MSG }, { status: 403 })
    }
    // 同设备回来 → 直接返回已有 session，无需校验姓名（设备本身即凭证）
    return NextResponse.json({
      success: true,
      student_name: activation.student_name,
      exam_level: activation.exam_level,
      session_id: activation.session_id,
      already_activated: true,
    })
  }

  // ── 首次激活 ──────────────────────────────────────────────

  // 需要选择级别
  if (!exam_level || !['ACC', 'PCC', 'MCC'].includes(exam_level)) {
    return NextResponse.json({ needs_level_selection: true, student_name: name }, { status: 200 })
  }

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 6)

  // 创建 session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      activation_code_id: activation.id,
      exam_level: exam_level as ExamLevel,
      browser_fingerprint: fingerprint,
      started_at: now.toISOString(),
      last_active_at: now.toISOString(),
    })
    .select()
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: '创建会话失败，请重试' }, { status: 500 })
  }

  // 写入激活信息（含姓名）
  await supabase
    .from('activation_codes')
    .update({
      is_used: true,
      student_name: name,
      browser_fingerprint: fingerprint,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      exam_level,
      session_id: session.id,
    })
    .eq('id', activation.id)

  return NextResponse.json({
    success: true,
    student_name: name,
    exam_level,
    session_id: session.id,
    already_activated: false,
  })
}
