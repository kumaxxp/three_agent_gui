'use client'
import { useRef, useState, useEffect } from 'react'
import type { AgentConfig, RoleKey } from '@/types'
import { MetricCard } from './MetricCard'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// Phase 1のインポート
import { SmartConversationManager, type ConversationContext } from '@/lib/conversation-manager/ConversationManager'
// Phase 2のインポート
import { ConversationAnalyzer, type DetailedAnalysis } from '@/lib/conversation-manager/ConversationAnalyzer'
import { ConversationAnalysisPanel } from './ConversationAnalysisPanel'
// Phase 3のインポート
import { AdaptivePromptSystem, type PromptVariant, type ExperimentResult } from '@/lib/prompt-evolution/AdaptivePromptSystem'
import { PromptEvolutionPanel } from './PromptEvolutionPanel'

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

// Phase 3: プロンプトバリアントを適用した設定を返す
function applyPromptVariant(agent: AgentConfig, variant?: PromptVariant): AgentConfig {
  if (!variant) return agent
  
  return {
    ...agent,
    promptSystem: variant.systemPrompt,
    promptStyle: variant.stylePrompt,
    temperature: variant.temperature
  }
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
  
  // Phase 2の状態
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [currentAnalysis, setCurrentAnalysis] = useState<DetailedAnalysis | null>(null)
  
  // Phase 3の状態
  const [adaptivePromptsEnabled, setAdaptivePromptsEnabled] = useState(false)
  const [showEvolution, setShowEvolution] = useState(false)
  const [activeVariants, setActiveVariants] = useState<Map<RoleKey, PromptVariant>>(new Map())
  const [evolutionStats, setEvolutionStats] = useState<Map<RoleKey, any>>(new Map())
  
  // マネージャーのインスタンス
  const conversationManager = useRef(new SmartConversationManager(strategy))
  const conversationAnalyzer = useRef(new ConversationAnalyzer(dialogueState.topic))
  // Phase 3: 適応型プロンプトシステムのインスタンス（設定を調整）
  const adaptivePromptSystem = useRef(new AdaptivePromptSystem({
    explorationRate: 0.3,        // 30%の確率で新しいバリアントを試す
    minSampleSize: 2,             // 最小2回で評価開始
    confidenceThreshold: 0.8,    // 信頼度閾値を下げる
    mutationRate: 0.2,            // 突然変異率を上げる
    crossoverRate: 0.3,           // 交叉率
    selectionPressure: 1.2,       // 選択圧を下げる
    maxVariants: 15,              // バリアント数を増やす
    maxGenerations: 10,           // 世代数を現実的に
    autoImprove: true,
    improvementThreshold: 0.05    // 5%の改善でも採用
  }))
  
  // Phase 3: 初期化時にベースラインプロンプトを登録
  useEffect(() => {
    const roles: RoleKey[] = ['boke', 'tsukkomi', 'director']
    roles.forEach(role => {
      adaptivePromptSystem.current.registerBaselinePrompt(role, agents[role])
    })
  }, []) // 初回のみ実行
  
  // Phase 3: 進化統計を更新
  useEffect(() => {
    if (!adaptivePromptsEnabled) return
    
    const updateStats = () => {
      const stats = new Map<RoleKey, any>()
      const roles: RoleKey[] = ['boke', 'tsukkomi', 'director']
      roles.forEach(role => {
        stats.set(role, adaptivePromptSystem.current.getEvolutionStats(role))
      })
      setEvolutionStats(stats)
    }
    
    updateStats()
    const interval = setInterval(updateStats, 5000) // 5秒ごとに更新
    
    return () => clearInterval(interval)
  }, [adaptivePromptsEnabled])

  // 戦略が変更されたらマネージャーを更新
  useEffect(() => {
    conversationManager.current.setStrategy(strategy)
  }, [strategy])
  
  // トピックが変更されたらアナライザーを更新
  useEffect(() => {
    conversationAnalyzer.current = new ConversationAnalyzer(dialogueState.topic)
  }, [dialogueState.topic])

  // 状態更新のヘルパー関数
  const updateTopic = (topic: string) => setDialogueState(prev => ({ ...prev, topic }))
  const updateTurns = (turns: number) => setDialogueState(prev => ({ ...prev, turns }))
  const updateOrder = (order: RoleKey[]) => setDialogueState(prev => ({ ...prev, order }))
  const updateLog = (log: DialogueState['log']) => setDialogueState(prev => ({ ...prev, log }))

  // 修正版：分析を常に実行（表示とは独立）
  const performAnalysis = (log: DialogueState['log'], currentTurn: number) => {
    const messages = log.map(l => ({
      who: l.who,
      text: l.text,
      timestamp: Date.now()
    }))
    
    const analysis = conversationAnalyzer.current.analyzeConversation(
      messages,
      dialogueState.topic,
      currentTurn,
      dialogueState.turns
    )
    
    // 表示用の状態更新は showAnalysis が有効な場合のみ
    if (showAnalysis) {
      setCurrentAnalysis(analysis)
    }
    
    // 重要：分析結果を返す（記録用）
    return analysis
  }
  
  // 修正版：実験結果の記録を改善
  const recordExperiment = (
    variantId: string,
    role: RoleKey,
    response: string,
    startTime: number,
    analysis?: DetailedAnalysis
  ) => {
    if (!adaptivePromptsEnabled) return
    
    // 分析がない場合の簡易メトリクス
    let qualityMetrics = {
      coherence: 0.5,
      engagement: 0.5,
      humor: 0.5,
      topicRelevance: 0.5,
      overall: 0.5
    }
    
    // 分析結果がある場合は使用
    if (analysis) {
      qualityMetrics = {
        coherence: analysis.coherence,
        engagement: analysis.engagement,
        humor: analysis.humor,
        topicRelevance: 1 - analysis.topicDrift,
        overall: (analysis.coherence + analysis.engagement + (1 - analysis.topicDrift)) / 3
      }
    } else {
      // 簡易評価：応答の長さと内容から推定
      const responseLength = response.length
      const hasQuestion = response.includes('？') || response.includes('?')
      const hasExclamation = response.includes('！') || response.includes('!')
      const wordCount = response.split(/[\s、。]/g).filter(w => w.length > 0).length
      
      // 長さから品質を推定
      const lengthScore = Math.min(responseLength / 100, 1) // 100文字で満点
      
      // エンゲージメントを推定
      const engagementScore = (hasQuestion ? 0.2 : 0) + (hasExclamation ? 0.2 : 0) + 0.5
      
      // 全体的な品質スコア
      qualityMetrics = {
        coherence: lengthScore * 0.8 + 0.2,
        engagement: engagementScore,
        humor: role === 'boke' ? 0.7 : 0.5,  // ボケは高めに評価
        topicRelevance: 0.6 + Math.random() * 0.2,  // ランダム要素を追加
        overall: (lengthScore + engagementScore) / 2
      }
    }
    
    const result: ExperimentResult = {
      variantId,
      conversationId: `conv_${Date.now()}`,
      timestamp: Date.now(),
      qualityMetrics,
      responseMetrics: {
        avgLength: response.length,
        avgTime: Date.now() - startTime,
        turnCount: dialogueState.log.length
      }
    }
    
    console.log(`[AdaptivePrompt] Recording experiment for ${role}:`, {
      variantId,
      score: qualityMetrics.overall.toFixed(3),
      length: response.length
    })
    
    adaptivePromptSystem.current.recordExperiment(result)
  }
  
  // Phase 3: ユーザー評価を処理
  const handleUserRating = (variantId: string, rating: number, comment?: string) => {
    const result: ExperimentResult = {
      variantId,
      conversationId: `conv_${Date.now()}`,
      timestamp: Date.now(),
      qualityMetrics: {
        coherence: rating / 5,
        engagement: rating / 5,
        humor: rating / 5,
        topicRelevance: rating / 5,
        overall: rating / 5
      },
      responseMetrics: {
        avgLength: 100, // ダミー値
        avgTime: 1000, // ダミー値
        turnCount: dialogueState.log.length
      },
      userFeedback: {
        rating,
        comment
      }
    }
    
    adaptivePromptSystem.current.recordExperiment(result)
  }

  async function startConversation() {
    if (running) return
    setRunning(true)
    
    // Phase 3: 会話IDを生成
    const conversationId = `conv_${Date.now()}`
    
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
      
      performAnalysis(currentLog, 0)
    }
    
    if (conversationMode === 'classic') {
      // クラシックモード
      for (let i = 0; i < dialogueState.turns; i++) {
        for (const role of dialogueState.order) {
          let cfg = agents[role]
          let variantId: string | undefined
          
          // Phase 3: 適応型プロンプトが有効な場合
          if (adaptivePromptsEnabled) {
            const variant = adaptivePromptSystem.current.selectPrompt(role)
            cfg = applyPromptVariant(cfg, variant)
            variantId = variant.id
            activeVariants.set(role, variant)
            console.log(`[AdaptivePrompt] Using variant ${variant.id} for ${role} (gen: ${variant.generation}, score: ${variant.performance.avgQualityScore.toFixed(3)})`)
          }
          
          const startTime = Date.now()
          
          try {
            const msg = await callAgent(cfg, role, currentLog, debugEnabled)
            
            const newEntry = { who: role, text: msg, model: cfg.model, provider: cfg.provider }
            currentLog.push(newEntry)
            
            setDialogueState(prev => ({
              ...prev,
              log: [...currentLog]
            }))
            
            // 修正：分析を実行して結果を取得
            const analysis = performAnalysis(currentLog, i)
            
            // Phase 3: 実験結果を記録（分析結果も渡す）
            if (variantId) {
              recordExperiment(variantId, role, msg, startTime, analysis)
            }
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
        
        let cfg = agents[nextSpeaker]
        let variantId: string | undefined
        
        // Phase 3: 適応型プロンプトが有効な場合
        if (adaptivePromptsEnabled) {
          const variant = adaptivePromptSystem.current.selectPrompt(nextSpeaker)
          cfg = applyPromptVariant(cfg, variant)
          variantId = variant.id
          activeVariants.set(nextSpeaker, variant)
          console.log(`[AdaptivePrompt] Using variant ${variant.id} for ${nextSpeaker} (gen: ${variant.generation}, score: ${variant.performance.avgQualityScore.toFixed(3)})`)
        }
        
        const startTime = Date.now()
        
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
          
          // 修正：分析を実行して結果を取得
          const analysis = performAnalysis(currentLog, currentTurn)
          
          // Phase 3: 実験結果を記録（分析結果も渡す）
          if (variantId) {
            recordExperiment(variantId, nextSpeaker, msg, startTime, analysis)
          }
          
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
                <div className="grid grid-cols-2 gap-3">
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
                  
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={showAnalysis}
                        onChange={(e) => setShowAnalysis(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-xs">リアルタイム分析</span>
                    </label>
                    
                    {/* Phase 3: 適応型プロンプトのトグル */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={adaptivePromptsEnabled}
                        onChange={(e) => {
                          setAdaptivePromptsEnabled(e.target.checked)
                          if (e.target.checked) {
                            setShowEvolution(true)
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-xs">🧬 適応型プロンプト</span>
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
            
            {/* Phase 3: テスト用バリアント生成ボタン */}
            {adaptivePromptsEnabled && (
              <button 
                className="mt-2 px-4 py-2 bg-purple-500 text-white rounded text-xs" 
                onClick={() => {
                  const roles: RoleKey[] = ['boke', 'tsukkomi', 'director']
                  roles.forEach(role => {
                    // 現在のベストバリアントを取得
                    const currentBest = adaptivePromptSystem.current.exportState().currentBest.get(role)
                    if (currentBest) {
                      // 強制的に新しいバリアントを生成
                      const newVariant: PromptVariant = {
                        id: `${role}_v${currentBest.version + 1}_test_${Date.now()}`,
                        roleKey: role,
                        version: currentBest.version + 1,
                        generation: currentBest.generation + 1,
                        systemPrompt: currentBest.systemPrompt + '\n【テスト】より創造的に。',
                        stylePrompt: currentBest.stylePrompt + '\n意外性を重視。',
                        temperature: Math.min(1, currentBest.temperature + 0.1),
                        performance: {
                          totalUses: 0,
                          successRate: 0,
                          avgQualityScore: 0.5,
                          avgResponseLength: 0,
                          avgResponseTime: 0,
                          coherenceScore: 0.5,
                          engagementScore: 0.5,
                          topicRelevanceScore: 0.5,
                          userRatings: [],
                          avgUserRating: 0,
                          confidenceInterval: 0
                        },
                        createdAt: Date.now(),
                        parentId: currentBest.id,
                        mutationType: 'manual',
                        experimentCount: 0,
                        isActive: true,
                        isBaseline: false
                      }
                      
                      // AdaptivePromptSystemに直接追加
                      const state = adaptivePromptSystem.current.exportState()
                      const variants = state.variants.get(role) || []
                      variants.push(newVariant)
                      state.variants.set(role, variants)
                      adaptivePromptSystem.current.importState(state)
                      
                      console.log(`[Manual] Created test variant for ${role}: ${newVariant.id}`)
                    }
                  })
                  
                  // 統計を更新
                  const stats = new Map<RoleKey, any>()
                  roles.forEach(role => {
                    stats.set(role, adaptivePromptSystem.current.getEvolutionStats(role))
                  })
                  setEvolutionStats(stats)
                  
                  alert('テストバリアントを生成しました。次回の会話で使用される可能性があります。')
                }}
                disabled={running}
              >
                🧪 バリアント生成
              </button>
            )}
            
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
              {/* Phase 3: 適応型プロンプト使用中の表示 */}
              {adaptivePromptsEnabled && (
                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                  🧬 適応中
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
                  <div className="flex items-center gap-1">
                    {badge(l.who)}
                    {/* Phase 3: 使用中のバリアント表示 */}
                    {adaptivePromptsEnabled && activeVariants.get(l.who) && (
                      <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded">
                        v{activeVariants.get(l.who)!.version}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm">{l.text}</div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
        
        {/* Phase 3: デバッグ情報（開発時のみ表示） */}
        {adaptivePromptsEnabled && debugEnabled && (
          <section className="rounded-2xl border p-4 bg-yellow-50">
            <h3 className="font-semibold text-sm mb-3">🔬 適応型プロンプト デバッグ情報</h3>
            <div className="space-y-2 text-xs font-mono">
              {(['boke', 'tsukkomi', 'director'] as RoleKey[]).map(role => {
                const variant = activeVariants.get(role)
                const stats = adaptivePromptSystem.current.getEvolutionStats(role)
                return (
                  <div key={role} className="border-b pb-2">
                    <div className="font-bold">{role === 'boke' ? 'ボケ' : role === 'tsukkomi' ? 'ツッコミ' : 'ディレクター'}</div>
                    {variant && (
                      <>
                        <div>現在: {variant.id}</div>
                        <div>世代: {variant.generation} / バージョン: {variant.version}</div>
                        <div>スコア: {variant.performance.avgQualityScore.toFixed(3)}</div>
                        <div>実験回数: {variant.experimentCount}</div>
                        <div>温度: {variant.temperature.toFixed(2)}</div>
                      </>
                    )}
                    <div className="mt-1 text-[10px] text-gray-600">
                      総バリアント: {stats.totalVariants} | 
                      アクティブ: {stats.activeVariants} | 
                      最高スコア: {stats.bestScore.toFixed(3)} | 
                      改善率: {(stats.improvementRate * 100).toFixed(1)}%
                    </div>
                  </div>
                )
              })}
              
              <div className="pt-2 text-[10px] text-gray-600">
                <div>探索率: {(0.3 * 100).toFixed(0)}%</div>
                <div>最小サンプル: 2回</div>
                <div>自動改善: 有効</div>
                <div className="mt-1 text-blue-600">
                  💡 ヒント: 3回同じ会話を実行すると、新しいバリアントが生成されます
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="col-span-4 space-y-4">
        {/* Phase 3: プロンプト進化パネル */}
        {showEvolution && adaptivePromptsEnabled ? (
          <PromptEvolutionPanel
            variants={adaptivePromptSystem.current.exportState().variants}
            currentBest={adaptivePromptSystem.current.exportState().currentBest}
            evolutionStats={evolutionStats}
            onUserRating={handleUserRating}
          />
        ) : showAnalysis && conversationMode === 'smart' ? (
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
                  {!showAnalysis && !adaptivePromptsEnabled && (
                    <div className="mt-2 p-2 bg-purple-50 rounded text-[10px]">
                      💡 リアルタイム分析や適応型プロンプトを有効にすると、より高度な機能が利用できます
                    </div>
                  )}
                  {adaptivePromptsEnabled && (
                    <div className="mt-2 p-2 bg-green-50 rounded text-[10px]">
                      🧬 プロンプトは会話から学習して自動的に改善されます
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