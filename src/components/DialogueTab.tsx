'use client'
import { useRef, useState, useEffect } from 'react'
import type { AgentConfig, RoleKey } from '@/types'
import { MetricCard } from './MetricCard'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// ★ 新規インポート
import { SmartConversationManager, type ConversationContext } from '@/lib/conversation-manager/ConversationManager'

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

async function callAgent(agent: AgentConfig, user: string, conversationHistory: Array<{ role: string; content: string }> = [], debugEnabled = false): Promise<string> {
  // 会話履歴を構築
  const messages = [
    // システムプロンプト
    agent.promptSystem ? { role: 'system', content: agent.promptSystem } : null,
    // スタイルプロンプト
    agent.promptStyle ? { role: 'system', content: `[STYLE]\n${agent.promptStyle}` } : null,
    // 過去の会話履歴
    ...conversationHistory,
    // 現在のユーザー入力
    { role: 'user', content: user },
  ].filter(Boolean) as Array<{ role: string; content: string }>

  const payload = {
    provider: agent.provider,
    endpoint: agent.endpoint,
    apiKey: agent.apiKey,
    model: normalizeModelId(agent.provider, agent.model),
    temperature: agent.temperature,
    top_p: agent.top_p,
    max_tokens: agent.max_tokens,
    repetition_penalty: agent.repetition_penalty,
    messages,
    stream: true,
    enableDebug: debugEnabled,
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
  setDialogueState,
  debugEnabled = false
}: { 
  agents: Record<RoleKey, AgentConfig>
  dialogueState: DialogueState
  setDialogueState: (state: DialogueState | ((prev: DialogueState) => DialogueState)) => void
  debugEnabled?: boolean
}) {
  const [running, setRunning] = useState(false)
  
  // ★ AutoGen-Inspired機能の状態
  const [conversationMode, setConversationMode] = useState<'classic' | 'smart'>('classic')
  const [strategy, setStrategy] = useState<'round_robin' | 'reactive' | 'balanced'>('reactive')
  const [nextSpeakerPrediction, setNextSpeakerPrediction] = useState<RoleKey | null>(null)
  
  // ★ SmartConversationManagerのインスタンス
  const conversationManager = useRef(new SmartConversationManager(strategy))

  // ★ 戦略が変更されたらマネージャーを更新
  useEffect(() => {
    conversationManager.current.setStrategy(strategy)
  }, [strategy])

  // 状態更新のヘルパー関数
  const updateTopic = (topic: string) => setDialogueState(prev => ({ ...prev, topic }))
  const updateTurns = (turns: number) => setDialogueState(prev => ({ ...prev, turns }))
  const updateOrder = (order: RoleKey[]) => setDialogueState(prev => ({ ...prev, order }))
  const updateLog = (log: DialogueState['log']) => setDialogueState(prev => ({ ...prev, log }))

  // ★ 修正版：スマートモードとクラシックモードの両方に対応
  async function startConversation() {
    if (running) return
    setRunning(true)
    let current = dialogueState.topic
    
    // 現在のログ状態をローカル変数で管理
    let currentLog = [...dialogueState.log]
    
    if (conversationMode === 'classic') {
      // ===== クラシックモード（従来の固定順序）=====
      for (let i = 0; i < dialogueState.turns; i++) {
        for (const role of dialogueState.order) {
          const cfg = agents[role]
          try {
            const conversationHistory = currentLog.map(l => ({ 
              role: 'assistant',
              content: l.text 
            }))
            
            const msg = await callAgent(cfg, current, conversationHistory, debugEnabled)
            
            const newEntry = { who: role, text: msg, model: cfg.model, provider: cfg.provider }
            currentLog.push(newEntry)
            
            setDialogueState(prev => ({
              ...prev,
              log: [...currentLog]
            }))
            current = msg
          } catch (e: any) {
            const errorEntry = { who: role, text: '【エラー】' + e.message, model: cfg.model, provider: cfg.provider }
            currentLog.push(errorEntry)
            setDialogueState(prev => ({
              ...prev,
              log: [...currentLog]
            }))
            current = dialogueState.topic
          }
        }
      }
    } else {
      // ===== スマートモード（動的発言順序）=====
      const totalTurns = dialogueState.turns * 3 // 3人分のターン数
      
      for (let i = 0; i < totalTurns; i++) {
        // 次の発言者を動的に選択
        const context: ConversationContext = {
          topic: dialogueState.topic,
          history: currentLog.map(l => ({
            who: l.who,
            text: l.text,
            timestamp: Date.now()
          })),
          currentTurn: i,
          agents
        }
        
        const nextSpeaker = await conversationManager.current.selectNextSpeaker(context)
        setNextSpeakerPrediction(nextSpeaker) // UI更新用
        
        const cfg = agents[nextSpeaker]
        try {
          const conversationHistory = currentLog.map(l => ({ 
            role: 'assistant',
            content: l.text 
          }))
          
          const msg = await callAgent(cfg, current, conversationHistory, debugEnabled)
          
          const newEntry = { 
            who: nextSpeaker, 
            text: msg, 
            model: cfg.model, 
            provider: cfg.provider 
          }
          currentLog.push(newEntry)
          
          setDialogueState(prev => ({
            ...prev,
            log: [...currentLog]
          }))
          current = msg
        } catch (e: any) {
          const errorEntry = { 
            who: nextSpeaker, 
            text: '【エラー】' + e.message, 
            model: cfg.model, 
            provider: cfg.provider 
          }
          currentLog.push(errorEntry)
          setDialogueState(prev => ({
            ...prev,
            log: [...currentLog]
          }))
          current = dialogueState.topic
        }
      }
    }
    
    setRunning(false)
    setNextSpeakerPrediction(null)
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
          
          {/* ★ 新規：モード選択UI */}
          <div className="mb-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">会話エンジン</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setConversationMode('classic')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    conversationMode === 'classic' 
                      ? 'bg-black text-white' 
                      : 'bg-white border hover:bg-gray-50'
                  }`}
                >
                  Classic（固定順序）
                </button>
                <button
                  onClick={() => setConversationMode('smart')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    conversationMode === 'smart' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-white border hover:bg-purple-50'
                  }`}
                >
                  🚀 Smart（動的選択）
                </button>
              </div>
            </div>
            
            {/* ★ スマートモード選択時の追加オプション */}
            {conversationMode === 'smart' && (
              <div className="mt-2 pt-2 border-t">
                <label className="text-xs text-gray-600">選択戦略</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border p-1.5 text-xs"
                >
                  <option value="reactive">リアクティブ（文脈応答）</option>
                  <option value="balanced">バランス（均等発言）</option>
                  <option value="round_robin">ラウンドロビン（固定順）</option>
                </select>
              </div>
            )}
          </div>
          
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
          
          {/* ★ クラシックモードの時のみ順序編集を表示 */}
          {conversationMode === 'classic' && (
            <>
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
            </>
          )}
          
          <div className="mt-3 flex items-center gap-2">
            <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded" onClick={startConversation} disabled={running}>
              開始（対話）
            </button>
            {conversationMode === 'smart' && running && nextSpeakerPrediction && (
              <span className="text-xs text-purple-600 animate-pulse">
                次の発言者: {nextSpeakerPrediction === 'boke' ? 'ボケ' : 
                             nextSpeakerPrediction === 'tsukkomi' ? 'ツッコミ' : 
                             'ディレクター'}
              </span>
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">対話ログ</h3>
            {conversationMode === 'smart' && (
              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                {strategy === 'reactive' ? '文脈応答モード' :
                 strategy === 'balanced' ? 'バランスモード' :
                 'ラウンドロビンモード'}
              </span>
            )}
          </div>
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
        
        {/* ★ スマートモード時の追加情報 */}
        {conversationMode === 'smart' && (
          <section className="rounded-2xl border p-4 text-xs text-gray-600">
            <div className="font-medium mb-2">🤖 Smart Mode情報</div>
            <div className="space-y-1">
              <div>戦略: {strategy === 'reactive' ? 'リアクティブ' : 
                          strategy === 'balanced' ? 'バランス' : 
                          'ラウンドロビン'}</div>
              <div>動的選択: 有効</div>
              <div className="mt-2 text-[10px] text-purple-600">
                ※ ディレクターは会話の流れを見て自動介入します
              </div>
            </div>
          </section>
        )}
        
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