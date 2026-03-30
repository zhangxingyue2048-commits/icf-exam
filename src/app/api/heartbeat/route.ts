import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * 心跳接口：每30秒由活跃标签页调用。
 * - 用 tab_token 争抢 active_tab_token。
 * - 若当前 active_tab_token 不是自己，说明被新标签页踢出，返回 kicked: true。
 */
export async function POST(req: NextRequest) {
  const { session_id, tab_token } = await req.json()

  if (!session_id || !tab_token) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('active_tab_token, last_active_at')
    .eq('id', session_id)
    .single()

  if (!session) {
    return NextResponse.json({ kicked: true, reason: 'session_not_found' })
  }

  const now = new Date().toISOString()

  // 没有活跃token，或者就是自己 → 更新为自己
  if (!session.active_tab_token || session.active_tab_token === tab_token) {
    await supabase
      .from('sessions')
      .update({ active_tab_token: tab_token, last_active_at: now })
      .eq('id', session_id)
    return NextResponse.json({ kicked: false })
  }

  // 别的 token 占用中 → 检查上次活跃时间，超过60秒认为旧标签已死，允许接管
  const lastActive = new Date(session.last_active_at)
  const secondsSinceActive = (Date.now() - lastActive.getTime()) / 1000

  if (secondsSinceActive > 60) {
    // 旧标签页超时，本标签页接管
    await supabase
      .from('sessions')
      .update({ active_tab_token: tab_token, last_active_at: now })
      .eq('id', session_id)
    return NextResponse.json({ kicked: false })
  }

  // 旧标签页仍活跃 → 本标签页被踢
  return NextResponse.json({ kicked: true, reason: 'another_tab_active' })
}
