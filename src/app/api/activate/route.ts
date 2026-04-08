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

  if (!/^ICF-[A-Z0-9-]{1,20}$/i.test(code)) {
    return NextResponse.json({ error: '激活码格式不正确' }, { status: 400 })
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

  // 已过期（仅当 expires_at 有值且已过期时拒绝）
  if (activation.expires_at && new Date(activation.expires_at) < new Date()) {
    return NextResponse.json({ error: '激活码已过期，请联系客服续期' }, { status: 403 })
  }

  // 已激活过
  if (activation.is_used) {
    // 指纹已存且不匹配 → 不同设备拒绝
    // 注意：browser_fingerprint 为 null/空时（旧数据）不触发设备冲突，允许通过
    if (activation.browser_fingerprint && activation.browser_fingerprint !== fingerprint) {
      return NextResponse.json({ error: DEVICE_CONFLICT_MSG }, { status: 403 })
    }
    // 同设备回来 → 直接返回已有 session
    return NextResponse.json({
      success: true,
      student_name: activation.student_name,
      exam_level: activation.activated_level || activation.exam_level,
      session_id: activation.session_id,
      already_activated: true,
    })
  }

  // ── 首次激活 ──────────────────────────────────────────────

  // 确定最终级别：优先用预设级别，否则用学员选择的级别
  const finalLevel: string = activation.exam_level || exam_level || ''

  if (!finalLevel || !['ACC', 'PCC', 'MCC'].includes(finalLevel)) {
    // 未预设级别且学员未提供 → 让学员选择
    return NextResponse.json({ needs_level_selection: true, student_name: name }, { status: 200 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000) // 激活日起 6 个月

  // 创建 session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      activation_code_id: activation.id,
      exam_level: finalLevel as ExamLevel,
      browser_fingerprint: fingerprint,
      started_at: now.toISOString(),
      last_active_at: now.toISOString(),
    })
    .select()
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: '创建会话失败，请重试' }, { status: 500 })
  }

  // 写入激活信息
  await supabase
    .from('activation_codes')
    .update({
      is_used: true,
      student_name: name,
      browser_fingerprint: fingerprint,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      activated_level: finalLevel,   // 学员实际使用的级别（新字段）
      session_id: session.id,
      // exam_level 保持原值不覆盖（运营预设字段）
    })
    .eq('id', activation.id)

  return NextResponse.json({
    success: true,
    student_name: name,
    exam_level: finalLevel,
    session_id: session.id,
    already_activated: false,
  })
}
