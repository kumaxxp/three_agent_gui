'use client'
import { useRef, useState, useEffect } from 'react'
import type { AgentConfig, RoleKey } from '@/types'
import { MetricCard } from './MetricCard'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


// 対話状態の型定義
interface DialogueState {
  topic: string
  turns: number
  order: RoleKey[]
  log: { who: RoleKey; text: string; model: string; provider: string }[]
}

function normalizeModelId(provider: AgentConfig['provider'], model: string) {
  const m = model.trim()
  if (provider === 'Ollama') {
    const map: Record<string,string> = {
      'Gemma3-4B': 'gemma3:4b',
      'Gemma3-12B': 'gemma3:12b',
      'GPT-OSS 20B': 'gpt-oss:20b',
      'gpt-oss-20B': 'gpt-oss:20b',
      'gemma3:4b': 'gemma3:4b',
      'gemma3:12b': 'gemma3:12b',
      'gpt-oss:20b': 'gpt-oss:20b',
    }
    return map[m] ?? m
  }
  return m
}

async function callAgent(agent: AgentConfig, user: string): Promise<string> {
  const payload = {
    provider: agent.provider,
    endpoint: agent.endpoint,
    apiKey: agent.apiKey,
    model: normalizeModelId(agent.provider, agent.model),
    temperature: agent.temperature,
    top_p: agent.top_p,
    max_tokens: Math.min(agent.max_tokens ?? 128, 128),
    repetition_penalty: agent.repetition_penalty,
    system: agent.promptSystem
      ? agent.promptSystem + '\n\n出力は短く。思考過程は出力しない。'
      : '出力は短く。思考過程は出力しない。',
    style: agent.promptStyle,
    user,
    stream: true,
  }
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let result = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payloadStr = trimmed.slice(5).trim()
      if (payloadStr === '[DONE]') continue
      try {
        const json = JSON.parse(payloadStr)
        const delta = json?.choices?.[0]?.delta?.content ?? ''
        if (delta) result += delta
      } catch {
        // JSON でない行は無視
      }
    }
  }
  return result
}

function SortablePill({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-move rounded-full border px-3 py-1 text-xs bg-white">
      {label}
    </div>
  )
}

export function DialogueTab({ 
  agents, 
  dialogueState, 
  setDialogueState 
}: { 
  agents: Record<RoleKey, AgentConfig>
  dialogueState: DialogueState
  setDialogueState: (state: DialogueState | ((prev: DialogueState) => DialogueState)) => void
}) {
  const [running, setRunning] = useState(false)

  // 状態更新のヘルパー関数
  const updateTopic = (topic: string) => setDialogueState(prev => ({ ...prev, topic }))
  const updateTurns = (turns: number) => setDialogueState(prev => ({ ...prev, turns }))
  const updateOrder = (order: RoleKey[]) => setDialogueState(prev => ({ ...prev, order }))
  const updateLog = (log: DialogueState['log']) => setDialogueState(prev => ({ ...prev, log }))

  async function startConversation() {
    if (running) return
    setRunning(true)
    let current = dialogueState.topic
    
    for (let i = 0; i < dialogueState.turns; i++) {
      for (const role of dialogueState.order) {
        const cfg = agents[role]
        try {
          const msg = await callAgent(cfg, current)
          // 状態更新を関数形式にして、最新の状態を取得
          setDialogueState(prev => ({
            ...prev,
            log: [...prev.log, { who: role, text: msg, model: cfg.model, provider: cfg.provider }]
          }))
          current = msg
        } catch (e: any) {
          // エラー時も同様に関数形式で状態更新
          setDialogueState(prev => ({
            ...prev,
            log: [...prev.log, { who: role, text: '【エラー】' + e.message, model: cfg.model, provider: cfg.provider }]
          }))
          current = dialogueState.topic  // エラー時は話題に戻すなど適宜処理
        }
      }
    }
    setRunning(false)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const logEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [dialogueState.log])

  const startMock = () => {
    updateLog([
      ...dialogueState.log,
      { who: 'director', text: 'テンポ上げます。次、逆張りボケから入って。', model: agents.director.model, provider: agents.director.provider },
      { who: 'boke', text: 'じゃあ静かな時は冷蔵庫が息止めてる。', model: agents.boke.model, provider: agents.boke.provider },
      { who: 'tsukkomi', text: '止めない。仕組み上。', model: agents.tsukkomi.model, provider: agents.tsukkomi.provider },
    ])
  }

  const badge = (who: RoleKey) => (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]">
      <span className="font-medium">{agents[who].provider}</span>
      <span className="text-gray-500">{agents[who].model}</span>
    </span>
  )

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-8 space-y-4">
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">セッション設定</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600">話題</label>
              <input className="mt-1 w-full rounded-xl border p-2" value={dialogueState.topic} onChange={(e) => updateTopic(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">ターン数</label>
              <input type="number" className="mt-1 w-full rounded-xl border p-2" value={dialogueState.turns} onChange={(e) => updateTurns(Number(e.target.value))} />
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-600">順序編集（ドラッグ&ドロップ）</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={(e)=>{
              const {active, over} = e
              if (over && active.id !== over.id) {
                const ids = dialogueState.order.map((x)=>x)
                const oldIndex = ids.indexOf(active.id as any)
                const newIndex = ids.indexOf(over.id as any)
                updateOrder(arrayMove(ids, oldIndex, newIndex) as any)
              }
            }}>
            <SortableContext items={dialogueState.order} strategy={verticalListSortingStrategy}>
              <div className="flex gap-2 mt-2">
                {dialogueState.order.map((r)=>(
                  <SortablePill key={r} id={r} label={r==='boke'?'ボケ': r==='tsukkomi'?'ツッコミ':'ディレクター'} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-3 flex items-center gap-2">
            <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded" onClick={startConversation} disabled={running}> 開始（対話）</button>
            <span className="text-xs text-gray-500">※モックは固定応答を追記します</span>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">対話ログ</h3>
          <div className="space-y-2 max-h-[52vh] overflow-auto pr-2">
            {dialogueState.log.map((l, i) => (
              <div key={i} className={`rounded-xl border p-3 ${i === dialogueState.log.length - 1 ? 'ring-1 ring-black/10' : ''}`}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="font-semibold">{l.who === 'boke' ? '[BOKE]' : l.who === 'tsukkomi' ? '[TSUK]' : '[DIR]'}</div>
                  {badge(l.who)}
                </div>
                <div className="text-sm">{l.text}</div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
      </div>

      <div className="col-span-4 space-y-4">
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">全体計器</h3>
          <div className="flex flex-wrap gap-2">
            <MetricCard label="平均Latency" value={Math.round(((agents.boke.rtt ?? 150) + (agents.tsukkomi.rtt ?? 160) + (agents.director.rtt ?? 170)) / 3)} />
            <MetricCard label="平均tokens/s" value={Math.round(((agents.boke.tps ?? 8) + (agents.tsukkomi.tps ?? 7) + (agents.director.tps ?? 6)) / 3)} />
            <MetricCard label="発話数" value={dialogueState.log.length} />
            <MetricCard label="被り率" value={'低'} />
          </div>
        </section>
        <section className="rounded-2xl border p-4 text-xs text-gray-600">
          <div className="font-medium mb-2">疎通ステータス</div>
          <ul className="space-y-1">
            {(['boke','tsukkomi','director'] as RoleKey[]).map((r) => (
              <li key={r} className="flex items-center justify-between">
                <span>{r === 'boke' ? 'ボケ' : r === 'tsukkomi' ? 'ツッコミ' : 'ディレクター'}</span>
                <span className="text-[10px] rounded-full bg-green-100 text-green-700 px-2 py-0.5">OK</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
