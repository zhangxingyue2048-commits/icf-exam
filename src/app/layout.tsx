import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ICF笔试题目练习',
  description: 'ICF ACC / PCC / MCC 认证考试备考练习系统',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-[var(--border)] bg-[var(--surface)]">
            <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                <span className="text-white text-xs font-bold">ICF</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-[var(--foreground)]">壹點學園</h1>
                <p className="text-xs text-[var(--text-muted)]">ICF教练认证备考平台</p>
              </div>
            </div>
          </header>
          <main className="max-w-3xl mx-auto px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
