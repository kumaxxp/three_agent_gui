'use client'
import { useState } from 'react'
import type { RoleKey } from '@/types'
import { useAppStore, saveSettings, loadSettings } from '@/state/store'
import { AgentEditor } from '@/components/AgentEditor'
import { DialogueTab } from '@/components/DialogueTab'

export default function Page() {
  const [tab, setTab] = useState<'boke'|'tsukkomi'|'director'|'dialogue'>('dialogue')
  const agents = useAppStore((s) => s.agents)
  const setAgent = useAppStore((s) => s.setAgent)

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'boke', label: 'ボケ' },
    { key: 'tsukkomi', label: 'ツッコミ' },
    { key: 'director', label: 'ディレクター' },
    { key: 'dialogue', label: '対話' },
  ]

  const update = (key: RoleKey) => (cfg: any) => setAgent(key, cfg)

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold">3エージェント対話GUI — ローカルMVP</div>
          <div className="flex items-center gap-2 text-xs">
            <button className="rounded-xl border px-3 py-1.5" onClick={()=>saveSettings()}>設定保存</button>
            <button className="rounded-xl border px-3 py-1.5" onClick={()=>loadSettings()}>読み込み</button>
            <button className="rounded-xl bg-black text-white px-3 py-1.5" onClick={()=>{
              const blob = new Blob([JSON.stringify(agents, null, 2)], {type:'application/json'})
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'settings.json'; a.click()
              URL.revokeObjectURL(url)
            }}>エクスポート</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex gap-2">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-2xl px-4 py-2 text-sm border ${tab === t.key ? 'bg-black text-white' : 'bg-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-2">
          {tab !== 'dialogue' && tab === 'boke' && <AgentEditor role="boke" config={agents.boke} onChange={update('boke')} />}
          {tab !== 'dialogue' && tab === 'tsukkomi' && <AgentEditor role="tsukkomi" config={agents.tsukkomi} onChange={update('tsukkomi')} />}
          {tab !== 'dialogue' && tab === 'director' && <AgentEditor role="director" config={agents.director} onChange={update('director')} />}
          {tab === 'dialogue' && <DialogueTab agents={agents} />}
        </div>
      </main>
    </div>
  )
}
