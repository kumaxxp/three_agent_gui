import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '3エージェント対話GUI',
  description: 'Boke/Tsukkomi/Director multi-agent dialogue GUI'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
