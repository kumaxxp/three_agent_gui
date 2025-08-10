'use client'
import { useState } from 'react'
import type { RoleKey } from '@/types'
import { useAppStore, saveSettings, loadSettings } from '@/state/store'
import { AgentEditor } from '@/components/AgentEditor'
import { DialogueTab } from '@/components/DialogueTab'
import SettingsManager from '@/components/SettingsManager'

// 対話状態の型定義
interface DialogueState {
  topic: string
  turns: number
  order: RoleKey[]
  log: { who: RoleKey; text: string; model: string; provider: string }[]
}

export default function Page() {
  const [tab, setTab] = useState<'boke'|'tsukkomi'|'director'|'dialogue'>('dialogue')
  const [feedback, setFeedback] = useState<string>('')
  const [showSettingsManager, setShowSettingsManager] = useState(false)
  const agents = useAppStore((s) => s.agents)
  const setAgent = useAppStore((s) => s.setAgent)

  // 対話状態を親コンポーネントで管理
  const [dialogueState, setDialogueState] = useState<DialogueState>({
    topic: '冷蔵庫が鳴く理由',
    turns: 6,
    order: ['director', 'boke', 'tsukkomi'],
    log: [
      { who: 'director', text: '本日のテーマは『冷蔵庫が鳴く理由』。まずはボケから一言。', model: agents.director.model, provider: agents.director.provider },
      { who: 'boke', text: '氷の精霊が打楽器の練習してるだけ。', model: agents.boke.model, provider: agents.boke.provider },
      { who: 'tsukkomi', text: '精霊いない。コンプレッサだよ。', model: agents.tsukkomi.model, provider: agents.tsukkomi.provider },
    ]
  })

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'boke', label: 'ボケ' },
    { key: 'tsukkomi', label: 'ツッコミ' },
    { key: 'director', label: 'ディレクター' },
    { key: 'dialogue', label: '対話' },
  ]

  const update = (key: RoleKey) => (cfg: any) => setAgent(key, cfg)

  // フィードバック表示のヘルパー
  const showFeedback = (message: string) => {
    setFeedback(message)
    setTimeout(() => setFeedback(''), 2000)
  }

  const handleSaveSettings = () => {
    saveSettings()
    showFeedback('設定を保存しました')
  }

  const handleLoadSettings = () => {
    const success = loadSettings()
    if (success) {
      showFeedback('設定を読み込みました')
    } else {
      showFeedback('保存された設定が見つかりません')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold">3エージェント対話GUI — ローカルMVP</div>
          <div className="flex items-center gap-2 text-xs">
            <button 
              className="rounded-xl border px-3 py-1.5" 
              onClick={() => setShowSettingsManager(true)}
            >
              設定管理
            </button>
            <button className="rounded-xl border px-3 py-1.5" onClick={handleSaveSettings}>クイック保存</button>
            <button className="rounded-xl border px-3 py-1.5" onClick={handleLoadSettings}>クイック読込</button>
            <button className="rounded-xl bg-black text-white px-3 py-1.5" onClick={()=>{
              const blob = new Blob([JSON.stringify(agents, null, 2)], {type:'application/json'})
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'settings.json'; a.click()
              URL.revokeObjectURL(url)
              showFeedback('設定をエクスポートしました')
            }}>エクスポート</button>
            {feedback && (
              <div className="ml-4 rounded-xl bg-green-100 text-green-700 px-3 py-1.5 text-xs">
                {feedback}
              </div>
            )}
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
          {tab === 'dialogue' && <DialogueTab agents={agents} dialogueState={dialogueState} setDialogueState={setDialogueState} />}
        </div>
      </main>

      {/* 設定管理モーダル */}
      <SettingsManager
        isOpen={showSettingsManager}
        onClose={() => setShowSettingsManager(false)}
        onFeedback={showFeedback}
      />
    </div>
  )
}
