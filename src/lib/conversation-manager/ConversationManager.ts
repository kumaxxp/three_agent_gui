// src/lib/conversation-manager/ConversationManager.ts
// Phase 1: 基本的な動的発言順序システム

import type { RoleKey, AgentConfig } from '@/types'

export interface Message {
  who: RoleKey
  text: string
  timestamp: number
  model?: string
  provider?: string
}

export interface ConversationContext {
  topic: string
  history: Message[]
  currentTurn: number
  agents: Record<RoleKey, AgentConfig>
}

export interface ConversationAnalysis {
  momentum: number        // 会話の勢い (0-1)
  topicDrift: number     // トピックからの逸脱度 (0-1)
  tensionLevel: number   // 緊張度 (0-1)
  lastSpeaker: RoleKey | null
  turnsSinceDirector: number
}

/**
 * スマート会話マネージャー
 * AutoGen-Inspiredな動的発言者選択を実装
 */
export class SmartConversationManager {
  private strategy: SelectionStrategy
  
  constructor(strategyType: 'round_robin' | 'reactive' | 'balanced' = 'reactive') {
    this.strategy = this.createStrategy(strategyType)
  }

  /**
   * 次の発言者を選択
   */
  async selectNextSpeaker(context: ConversationContext): Promise<RoleKey> {
    const analysis = this.analyzeConversation(context)
    return this.strategy.selectSpeaker(context, analysis)
  }

  /**
   * 会話を分析
   */
  private analyzeConversation(context: ConversationContext): ConversationAnalysis {
    const history = context.history
    const recentHistory = history.slice(-5)
    
    // 最後の発言者
    const lastSpeaker = history.length > 0 
      ? history[history.length - 1].who 
      : null

    // ディレクターが最後に発言してからのターン数
    let turnsSinceDirector = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].who === 'director') break
      turnsSinceDirector++
    }

    // 会話の勢いを計算（文字数の変化率）
    const momentum = this.calculateMomentum(recentHistory)

    // トピックからの逸脱度（簡易版：話題の単語が含まれているか）
    const topicDrift = this.calculateTopicDrift(context.topic, recentHistory)

    // 緊張度（短い応答が続くと高くなる）
    const tensionLevel = this.calculateTension(recentHistory)

    return {
      momentum,
      topicDrift,
      tensionLevel,
      lastSpeaker,
      turnsSinceDirector
    }
  }

  private calculateMomentum(history: Message[]): number {
    if (history.length < 2) return 0.5

    const lengths = history.map(m => m.text.length)
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const recentAvg = lengths.slice(-2).reduce((a, b) => a + b, 0) / 2

    // 最近の発言が平均より長ければ勢いがある
    return Math.min(Math.max(recentAvg / avgLength, 0), 1)
  }

  private calculateTopicDrift(topic: string, history: Message[]): number {
    if (history.length === 0) return 0

    const topicWords = topic.toLowerCase().split(/\s+/)
    const recentText = history.map(m => m.text.toLowerCase()).join(' ')
    
    let matchCount = 0
    topicWords.forEach(word => {
      if (recentText.includes(word)) matchCount++
    })

    // トピックの単語が含まれているほど逸脱度が低い
    return 1 - (matchCount / topicWords.length)
  }

  private calculateTension(history: Message[]): number {
    if (history.length < 2) return 0.3

    const avgLength = history.map(m => m.text.length).reduce((a, b) => a + b, 0) / history.length
    
    // 平均50文字以下なら緊張度が高い
    if (avgLength < 50) return 0.8
    if (avgLength < 100) return 0.5
    return 0.3
  }

  private createStrategy(type: string): SelectionStrategy {
    switch (type) {
      case 'round_robin':
        return new RoundRobinStrategy()
      case 'balanced':
        return new BalancedStrategy()
      case 'reactive':
      default:
        return new ReactiveStrategy()
    }
  }

  /**
   * 戦略を変更
   */
  setStrategy(strategyType: 'round_robin' | 'reactive' | 'balanced') {
    this.strategy = this.createStrategy(strategyType)
  }
}

/**
 * 選択戦略の基底クラス
 */
abstract class SelectionStrategy {
  abstract selectSpeaker(
    context: ConversationContext,
    analysis: ConversationAnalysis
  ): RoleKey
}

// ConversationManager.ts の ReactiveStrategy クラスを以下に置き換えてください

/**
 * リアクティブ戦略：文脈に応じて最適な発言者を選択
 */
class ReactiveStrategy extends SelectionStrategy {
  selectSpeaker(
    context: ConversationContext,
    analysis: ConversationAnalysis
  ): RoleKey {
    // ★ 修正：ディレクターの介入条件を厳格化
    if (this.shouldDirectorIntervene(analysis)) {
      return 'director'
    }

    // 最後の発言者に基づいて次を決定
    if (analysis.lastSpeaker === 'boke') {
      // ボケの後は基本的にツッコミ
      return 'tsukkomi'
    } else if (analysis.lastSpeaker === 'tsukkomi') {
      // ツッコミの後は基本的にボケ
      return 'boke'
    } else if (analysis.lastSpeaker === 'director') {
      // ディレクターの後は指示に従う（ランダム）
      return Math.random() > 0.5 ? 'boke' : 'tsukkomi'
    }

    // 初回はディレクターから開始
    return 'director'
  }

  private shouldDirectorIntervene(analysis: ConversationAnalysis): boolean {
    // ★ 修正：介入条件を厳格化（頻度を下げる）
    return (
      // トピックから大きく逸脱している（閾値を上げた）
      analysis.topicDrift > 0.85 ||
      // 緊張度が非常に高い（閾値を上げた）
      analysis.tensionLevel > 0.9 ||
      // 会話の勢いが著しく落ちている（閾値を下げた）
      analysis.momentum < 0.2 ||
      // ディレクターがかなり長く発言していない（回数を増やした）
      analysis.turnsSinceDirector > 10
    )
  }
}

/**
 * バランス戦略：発言量を均等にする
 */
class BalancedStrategy extends SelectionStrategy {
  selectSpeaker(
    context: ConversationContext,
    analysis: ConversationAnalysis
  ): RoleKey {
    const history = context.history
    
    // 各エージェントの発言回数をカウント
    const counts: Record<RoleKey, number> = {
      boke: 0,
      tsukkomi: 0,
      director: 0
    }

    history.forEach(msg => {
      counts[msg.who]++
    })

    // 最も発言回数が少ないエージェントを選択
    let minCount = Infinity
    let selected: RoleKey = 'boke'

    Object.entries(counts).forEach(([role, count]) => {
      // 同じ人が連続しないようにする
      if (role !== analysis.lastSpeaker && count < minCount) {
        minCount = count
        selected = role as RoleKey
      }
    })

    return selected
  }
}

/**
 * ラウンドロビン戦略：固定順序
 */
class RoundRobinStrategy extends SelectionStrategy {
  private order: RoleKey[] = ['director', 'boke', 'tsukkomi']
  private index = 0

  selectSpeaker(): RoleKey {
    const speaker = this.order[this.index]
    this.index = (this.index + 1) % this.order.length
    return speaker
  }
}

/**
 * React Hook として使いやすくする
 */
export function useSmartConversation(strategyType: 'round_robin' | 'reactive' | 'balanced' = 'reactive') {
  const manager = new SmartConversationManager(strategyType)
  
  return {
    selectNextSpeaker: (context: ConversationContext) => 
      manager.selectNextSpeaker(context),
    setStrategy: (type: 'round_robin' | 'reactive' | 'balanced') =>
      manager.setStrategy(type)
  }
}