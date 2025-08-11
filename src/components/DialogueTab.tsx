'use client'
import { useRef, useState, useEffect } from 'react'
import type { AgentConfig, RoleKey } from '@/types'
import { MetricCard } from './MetricCard'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// ★ Phase 1のインポート
import { SmartConversationManager, type ConversationContext } from '@/lib/conversation-manager/ConversationManager'
// ★ Phase 2の新規インポート
import { ConversationAnalyzer, type DetailedAnalysis } from '@/lib/conversation-manager/ConversationAnalyzer'
import { ConversationAnalysisPanel } from './ConversationAnalysisPanel'

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

async function callAgent(
  agent: AgentConfig, 
  currentRole: RoleKey,
  dialogueLog: DialogueState['log'],
  debugEnabled = false
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = []
  
  if (agent.promptSystem) {
    messages.push({ role: 'system', content: agent.promptSystem })
  }
  
  if (agent.promptStyle) {
    messages.push({ role: 'system', content: `[STYLE]\n${agent.promptStyle}` })
  }
  
  if (dialogueLog.length > 0) {
    let conversationContext = "これまでの会話:\n"
    dialogueLog.forEach(entry => {
      const speaker = entry.who === 'boke' ? 'ボケ' : 
                     entry.who === 'tsukkomi' ? 'ツッコミ' : 
                     'ディレクター'
      conversationContext += `${speaker}: ${entry.text}\n`
    })
    
    const lastEntry = dialogueLog[dialogueLog.length - 1]
    conversationContext += `\nあなたは「${
      currentRole === 'boke' ? 'ボケ' : 
      currentRole === 'tsukkomi' ? 'ツッコミ' : 
      'ディレクター'
    }」として、この会話に続けて応答してください。`
    
    messages.push({ role: 'user', content: conversationContext })
  } else {
    messages.push({ 
      role: 'user', 
      content: `話題: ${dialogueLog.length === 0 ? '冷蔵庫が鳴く理由' : dialogueLog[dialogueLog.length - 1].text}` 
    })
  }

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
  
  // Phase 1の状態
  const [conversationMode, setConversationMode] = useState<'classic' | 'smart'>('classic')
  const [strategy, setStrategy] = useState<'round_robin' | 'reactive' | 'balanced'>('reactive')
  const [nextSpeakerPrediction, setNextSpeakerPrediction] = useState<RoleKey | null>(null)
  
  // ★ Phase 2の新規状態
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [currentAnalysis, setCurrentAnalysis] = useState<DetailedAnalysis | null>(null)
  
  // マネージャーのインスタンス
  const conversationManager = useRef(new SmartConversationManager(strategy))
  // ★ Phase 2: アナライザーのインスタンス
  const conversationAnalyzer = useRef(new ConversationAnalyzer(dialogueState.topic))

  // 戦略が変更されたらマネージャーを更新
  useEffect(() => {
    conversationManager.current.setStrategy(strategy)
  }, [strategy])
  
  // ★ Phase 2: トピックが変更されたらアナライザーを更新
  useEffect(() => {
    conversationAnalyzer.current = new ConversationAnalyzer(dialogueState.topic)
  }, [dialogueState.topic])

  // 状態更新のヘルパー関数
  const updateTopic = (topic: string) => setDialogueState(prev => ({ ...prev, topic }))
  const updateTurns = (turns: number) => setDialogueState(prev => ({ ...prev, turns }))
  const updateOrder = (order: RoleKey[]) => setDialogueState(prev => ({ ...prev, order }))
  const updateLog = (log: DialogueState['log']) => setDialogueState(prev => ({ ...prev, log }))

  // ★ Phase 2: 分析を実行する関数
  const performAnalysis = (log: DialogueState['log'], currentTurn: number) => {
    if (!showAnalysis) return
    
    const messages = log.map(l => ({
      who: l.who,
      text: l.text,
      timestamp: Date.now() // 簡易的にタイムスタンプを追加
    }))
    
    const analysis = conversationAnalyzer.current.analyzeConversation(
      messages,
      dialogueState.topic,
      currentTurn,
      dialogueState.turns
    )
    
    setCurrentAnalysis(analysis)
  }

  async function startConversation() {
    if (running) return
    setRunning(true)
    
    let currentLog = [...dialogueState.log]
    if (currentLog.length === 0) {
      const directorMsg = `本日のテーマは『${dialogueState.topic}』です。それでは始めましょう。`
      currentLog = [{
        who: 'director' as RoleKey,
        text: directorMsg,
        model: agents.director.model,
        provider: agents.director.provider
      }]
      setDialogueState(prev => ({
        ...prev,
        log: currentLog
      }))
      
      // ★ Phase 2: 初回分析
      performAnalysis(currentLog, 0)
    }
    
    if (conversationMode === 'classic') {
      // クラシックモード
      for (let i = 0; i < dialogueState.turns; i++) {
        for (const role of dialogueState.order) {
          const cfg = agents[role]
          try {
            const msg = await callAgent(cfg, role, currentLog, debugEnabled)
            
            const newEntry = { who: role, text: msg, model: cfg.model, provider: cfg.provider }
            currentLog.push(newEntry)
            
            setDialogueState(prev => ({
              ...prev,
              log: [...currentLog]
            }))
            
            // ★ Phase 2: 各発言後に分析を更新
            performAnalysis(currentLog, i)
          } catch (e: any) {
            const errorEntry = { who: role, text: '【エラー】' + e.message, model: cfg.model, provider: cfg.provider }
            currentLog.push(errorEntry)
            setDialogueState(prev => ({
              ...prev,
              log: [...currentLog]
            }))
          }
        }
      }
    } else {
      // スマートモード
      const maxUtterances = dialogueState.turns * 3
      let utteranceCount = 0
      
      const speakerCounts: Record<RoleKey, number> = {
        boke: 0,
        tsukkomi: 0,
        director: 0
      }
      
      while (utteranceCount < maxUtterances) {
        const currentTurn = Math.floor(utteranceCount / 3)
        
        // ★ Phase 2: 分析結果を使って次の発言者を選択（スマートモードの場合）
        const context: ConversationContext = {
          topic: dialogueState.topic,
          history: currentLog.map(l => ({
            who: l.who,
            text: l.text,
            timestamp: Date.now()
          })),
          currentTurn: currentTurn,
          agents
        }
        
        let nextSpeaker = await conversationManager.current.selectNextSpeaker(context)
        
        // 現在のターンで既に発言している人を制限
        const currentTurnStart = currentTurn * 3
        const currentTurnUtterances = currentLog.slice(currentTurnStart + 1)
        const speakersInCurrentTurn = currentTurnUtterances.map(u => u.who)
        
        const countInCurrentTurn = speakersInCurrentTurn.filter(w => w === nextSpeaker).length
        if (countInCurrentTurn >= 1 && strategy === 'reactive') {
          const availableSpeakers = (['boke', 'tsukkomi', 'director'] as RoleKey[])
            .filter(r => speakersInCurrentTurn.filter(w => w === r).length === 0)
          
          if (availableSpeakers.length > 0) {
            nextSpeaker = availableSpeakers[Math.floor(Math.random() * availableSpeakers.length)]
          }
        }
        
        setNextSpeakerPrediction(nextSpeaker)
        
        const cfg = agents[nextSpeaker]
        try {
          const msg = await callAgent(cfg, nextSpeaker, currentLog, debugEnabled)
          
          const newEntry = { 
            who: nextSpeaker, 
            text: msg, 
            model: cfg.model, 
            provider: cfg.provider 
          }
          currentLog.push(newEntry)
          speakerCounts[nextSpeaker]++
          utteranceCount++
          
          setDialogueState(prev => ({
            ...prev,
            log: [...currentLog]
          }))
          
          // ★ Phase 2: 各発言後に分析を更新
          performAnalysis(currentLog, currentTurn)
          
          console.log(`[Smart Mode] Turn ${currentTurn + 1}/${dialogueState.turns}, Utterance ${utteranceCount}/${maxUtterances}, Speaker: ${nextSpeaker}`)
          
        } catch (e: any) {
          const errorEntry = { 
            who: nextSpeaker, 
            text: '【エラー】' + e.message, 
            model: cfg.model, 
            provider: cfg.provider 
          }
          currentLog.push(errorEntry)
          utteranceCount++
          
          setDialogueState(prev => ({
            ...prev,
            log: [...currentLog]
          }))
        }
      }
      
      console.log('[Smart Mode] 完了 - 発言回数:', speakerCounts)
    }
    
    setRunning(false)
    setNextSpeakerPrediction(null)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const logEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [dialogueState.log])

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
          
          {/* モード選択UI */}
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
            
            {/* スマートモード選択時の追加オプション */}
            {conversationMode === 'smart' && (
              <div className="mt-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
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
                  
                  {/* ★ Phase 2: 分析表示トグル */}
                  <div className="ml-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={showAnalysis}
                        onChange={(e) => setShowAnalysis(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-xs">リアルタイム分析</span>
                    </label>
                  </div>
                </div>
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
          
          {/* クラシックモードの時のみ順序編集を表示 */}
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
            <button 
              className="mt-2 px-4 py-2 bg-gray-500 text-white rounded" 
              onClick={() => {
                setDialogueState(prev => ({ ...prev, log: [] }))
                setCurrentAnalysis(null)
              }}
              disabled={running}
            >
              クリア
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
            <div className="flex items-center gap-2">
              {conversationMode === 'smart' && (
                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                  {strategy === 'reactive' ? '文脈応答モード' :
                   strategy === 'balanced' ? 'バランスモード' :
                   'ラウンドロビンモード'}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {dialogueState.log.length} 発言
              </span>
            </div>
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
        {/* ★ Phase 2: リアルタイム分析パネル */}
        {showAnalysis && conversationMode === 'smart' ? (
          <ConversationAnalysisPanel 
            analysis={currentAnalysis} 
            isRunning={running}
          />
        ) : (
          <>
            <section className="rounded-2xl border p-4">
              <h3 className="font-semibold text-sm mb-3">全体計器</h3>
              <div className="flex flex-wrap gap-2">
                <MetricCard label="平均Latency" value={Math.round(((agents.boke.rtt ?? 150) + (agents.tsukkomi.rtt ?? 160) + (agents.director.rtt ?? 170)) / 3)} />
                <MetricCard label="平均tokens/s" value={Math.round(((agents.boke.tps ?? 8) + (agents.tsukkomi.tps ?? 7) + (agents.director.tps ?? 6)) / 3)} />
                <MetricCard label="発話数" value={dialogueState.log.length} />
                <MetricCard label="被り率" value={'低'} />
              </div>
            </section>
            
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
                  {!showAnalysis && (
                    <div className="mt-2 p-2 bg-purple-50 rounded text-[10px]">
                      💡 リアルタイム分析を有効にすると、詳細な会話メトリクスが表示されます
                    </div>
                  )}
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
          </>
        )}
      </div>
    </div>
  )
}