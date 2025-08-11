// src/lib/conversation-manager/ConversationAnalyzer.ts
// Phase 2: 詳細な会話分析システム

import type { RoleKey } from '@/types'
import type { Message } from './ConversationManager'

export interface DetailedAnalysis {
  // 基本メトリクス
  momentum: number           // 会話の勢い (0-1)
  topicDrift: number         // トピックからの逸脱度 (0-1)
  tensionLevel: number       // 緊張度 (0-1)
  coherence: number          // 一貫性 (0-1)
  engagement: number         // エンゲージメント (0-1)
  humor: number              // ユーモア度 (0-1)
  
  // 詳細情報
  averageResponseLength: number
  responseTimeVariance: number
  topicKeywordDensity: number
  turnTakingBalance: number
  repetitionRate: number
  
  // 発言者ごとの統計
  speakerStats: Map<RoleKey, SpeakerStatistics>
  
  // 会話フェーズ
  currentPhase: ConversationPhase
  phaseProgress: number  // フェーズ内の進行度 (0-1)
  
  // 推奨事項
  recommendations: Recommendation[]
  
  // 次の発言者の予測と理由
  nextSpeakerPrediction: {
    speaker: RoleKey
    confidence: number
    reasons: string[]
  }
}

export interface SpeakerStatistics {
  utteranceCount: number
  totalTokens: number
  averageLength: number
  lastSpokeAt: number
  contributionScore: number
  topicRelevance: number
  responsePattern: 'leading' | 'following' | 'balanced'
}

export interface Recommendation {
  type: 'intervention' | 'topic_shift' | 'energy_boost' | 'clarification'
  urgency: 'low' | 'medium' | 'high'
  message: string
  targetSpeaker?: RoleKey
}

export enum ConversationPhase {
  OPENING = 'opening',
  WARM_UP = 'warm_up',
  DEVELOPMENT = 'development',
  PEAK = 'peak',
  CLOSING = 'closing'
}

/**
 * 高度な会話分析エンジン
 */
export class ConversationAnalyzer {
  private topicKeywords: Set<string>
  private japaneseStopWords = new Set([
    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ',
    'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や',
    'れる', 'など', 'なっ', 'ない', 'この', 'ため', 'その', 'あっ', 'よう', 'また'
  ])
  
  constructor(topic: string) {
    this.topicKeywords = this.extractKeywords(topic)
  }
  
  /**
   * 詳細な会話分析を実行
   */
  analyzeConversation(
    messages: Message[],
    topic: string,
    currentTurn: number,
    maxTurns: number
  ): DetailedAnalysis {
    // トピックキーワードを更新
    this.topicKeywords = this.extractKeywords(topic)
    
    // 基本メトリクスを計算
    const momentum = this.calculateMomentum(messages)
    const topicDrift = this.calculateTopicDrift(messages)
    const tensionLevel = this.calculateTension(messages)
    const coherence = this.calculateCoherence(messages)
    const engagement = this.calculateEngagement(messages)
    const humor = this.calculateHumor(messages)
    
    // 詳細統計
    const stats = this.calculateDetailedStats(messages)
    const speakerStats = this.analyzeSpeakers(messages)
    
    // フェーズ判定
    const phase = this.determinePhase(currentTurn, maxTurns, messages)
    const phaseProgress = this.calculatePhaseProgress(currentTurn, maxTurns, phase)
    
    // 推奨事項生成
    const recommendations = this.generateRecommendations({
      momentum, topicDrift, tensionLevel, coherence, engagement,
      speakerStats, phase, messages
    })
    
    // 次の発言者予測
    const nextSpeakerPrediction = this.predictNextSpeaker(
      messages, speakerStats, phase, { momentum, topicDrift, tensionLevel }
    )
    
    return {
      momentum,
      topicDrift,
      tensionLevel,
      coherence,
      engagement,
      humor,
      ...stats,
      speakerStats,
      currentPhase: phase,
      phaseProgress,
      recommendations,
      nextSpeakerPrediction
    }
  }
  
  /**
   * キーワード抽出（簡易版）
   */
  private extractKeywords(text: string): Set<string> {
    // 日本語の単語分割（簡易版）
    const words = text
      .split(/[\s、。！？「」『』（）\[\]【】・…ー〜]/)
      .filter(word => word.length > 1)
      .filter(word => !this.japaneseStopWords.has(word))
    
    return new Set(words)
  }
  
  /**
   * 会話の勢いを詳細計算
   */
  private calculateMomentum(messages: Message[]): number {
    if (messages.length < 3) return 0.5
    
    const recent = messages.slice(-5)
    const older = messages.slice(-10, -5)
    
    if (older.length === 0) return 0.7
    
    // 文字数の変化
    const recentAvgLength = recent.reduce((sum, m) => sum + m.text.length, 0) / recent.length
    const olderAvgLength = older.reduce((sum, m) => sum + m.text.length, 0) / older.length
    
    // 発言間隔の変化（タイムスタンプが利用可能な場合）
    const recentIntervals = this.calculateIntervals(recent)
    const olderIntervals = this.calculateIntervals(older)
    
    // 勢いスコア計算
    const lengthMomentum = Math.min(recentAvgLength / Math.max(olderAvgLength, 1), 2) / 2
    const timeMomentum = olderIntervals > 0 
      ? Math.min(olderIntervals / Math.max(recentIntervals, 1), 2) / 2
      : 0.5
    
    return Math.min(Math.max((lengthMomentum + timeMomentum) / 2, 0), 1)
  }
  
  /**
   * トピック逸脱度の詳細計算
   */
  private calculateTopicDrift(messages: Message[]): number {
    if (messages.length === 0 || this.topicKeywords.size === 0) return 0
    
    const recent = messages.slice(-5)
    let keywordMatches = 0
    let totalWords = 0
    
    recent.forEach(msg => {
      const words = this.extractKeywords(msg.text)
      totalWords += words.size
      
      words.forEach(word => {
        if (this.topicKeywords.has(word)) {
          keywordMatches++
        }
      })
    })
    
    if (totalWords === 0) return 0.5
    
    // キーワード密度が低いほど逸脱度が高い
    const keywordDensity = keywordMatches / totalWords
    return Math.max(0, Math.min(1, 1 - keywordDensity * 10))
  }
  
  /**
   * 緊張度の計算
   */
  private calculateTension(messages: Message[]): number {
    if (messages.length < 2) return 0.3
    
    const recent = messages.slice(-5)
    
    // 短い応答が続くと緊張度が上がる
    const avgLength = recent.reduce((sum, m) => sum + m.text.length, 0) / recent.length
    
    // 感嘆符や疑問符の頻度
    const exclamationCount = recent.reduce((sum, m) => 
      sum + (m.text.match(/[！!？?]/g) || []).length, 0
    )
    
    // 否定語の頻度
    const negativeWords = ['ない', 'ダメ', '違う', 'いや', 'でも', 'しかし']
    const negativeCount = recent.reduce((sum, m) => {
      return sum + negativeWords.reduce((count, word) => 
        count + (m.text.includes(word) ? 1 : 0), 0
      )
    }, 0)
    
    const lengthTension = avgLength < 30 ? 0.8 : avgLength < 60 ? 0.5 : 0.3
    const exclamationTension = Math.min(exclamationCount / recent.length, 1)
    const negativeTension = Math.min(negativeCount / recent.length, 1)
    
    return (lengthTension + exclamationTension + negativeTension) / 3
  }
  
  /**
   * 一貫性の計算
   */
  private calculateCoherence(messages: Message[]): number {
    if (messages.length < 2) return 1
    
    let coherenceScore = 0
    const pairs = Math.min(messages.length - 1, 5)
    
    for (let i = messages.length - pairs; i < messages.length; i++) {
      if (i <= 0) continue
      
      const prev = messages[i - 1]
      const curr = messages[i]
      
      // 前の発言への応答性をチェック
      const hasReference = this.checkReference(prev.text, curr.text)
      if (hasReference) coherenceScore += 1
    }
    
    return pairs > 0 ? coherenceScore / pairs : 0.5
  }
  
  /**
   * エンゲージメントの計算
   */
  private calculateEngagement(messages: Message[]): number {
    if (messages.length < 3) return 0.5
    
    const recent = messages.slice(-10)
    
    // 発言の多様性
    const uniqueSpeakers = new Set(recent.map(m => m.who)).size
    const speakerDiversity = uniqueSpeakers / 3
    
    // 発言長のバリエーション
    const lengths = recent.map(m => m.text.length)
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length
    const lengthVariation = Math.min(Math.sqrt(variance) / avgLength, 1)
    
    // 質問の頻度
    const questionCount = recent.filter(m => m.text.includes('？') || m.text.includes('?')).length
    const questionRate = questionCount / recent.length
    
    return (speakerDiversity + lengthVariation + questionRate) / 3
  }
  
  /**
   * ユーモア度の計算（簡易版）
   */
  private calculateHumor(messages: Message[]): number {
    if (messages.length === 0) return 0
    
    const recent = messages.slice(-5)
    const humorIndicators = [
      '笑', 'www', 'ｗ', '草', 'ワロタ', 'ウケる',
      '面白', 'おもしろ', 'ツボ', 'じわる'
    ]
    
    let humorScore = 0
    recent.forEach(msg => {
      humorIndicators.forEach(indicator => {
        if (msg.text.includes(indicator)) {
          humorScore += 0.2
        }
      })
      
      // ボケの発言は基本的にユーモア要素
      if (msg.who === 'boke') {
        humorScore += 0.1
      }
    })
    
    return Math.min(humorScore / recent.length, 1)
  }
  
  /**
   * 詳細統計の計算
   */
  private calculateDetailedStats(messages: Message[]): {
    averageResponseLength: number
    responseTimeVariance: number
    topicKeywordDensity: number
    turnTakingBalance: number
    repetitionRate: number
  } {
    const lengths = messages.map(m => m.text.length)
    const avgLength = lengths.length > 0 
      ? lengths.reduce((a, b) => a + b, 0) / lengths.length 
      : 0
    
    // タイムスタンプのばらつき
    const intervals = this.calculateIntervals(messages)
    
    // キーワード密度
    let keywordCount = 0
    let totalWords = 0
    messages.forEach(msg => {
      const words = this.extractKeywords(msg.text)
      totalWords += words.size
      words.forEach(word => {
        if (this.topicKeywords.has(word)) keywordCount++
      })
    })
    const keywordDensity = totalWords > 0 ? keywordCount / totalWords : 0
    
    // ターンテイキングバランス
    const speakerCounts = new Map<RoleKey, number>()
    messages.forEach(msg => {
      speakerCounts.set(msg.who, (speakerCounts.get(msg.who) || 0) + 1)
    })
    const counts = Array.from(speakerCounts.values())
    const maxCount = Math.max(...counts)
    const minCount = Math.min(...counts)
    const balance = maxCount > 0 ? minCount / maxCount : 0
    
    // 繰り返し率
    const repetition = this.calculateRepetitionRate(messages)
    
    return {
      averageResponseLength: avgLength,
      responseTimeVariance: intervals,
      topicKeywordDensity: keywordDensity,
      turnTakingBalance: balance,
      repetitionRate: repetition
    }
  }
  
  /**
   * 発言者ごとの分析
   */
  private analyzeSpeakers(messages: Message[]): Map<RoleKey, SpeakerStatistics> {
    const stats = new Map<RoleKey, SpeakerStatistics>()
    const speakers: RoleKey[] = ['boke', 'tsukkomi', 'director']
    
    speakers.forEach(speaker => {
      const speakerMessages = messages.filter(m => m.who === speaker)
      
      if (speakerMessages.length === 0) {
        stats.set(speaker, {
          utteranceCount: 0,
          totalTokens: 0,
          averageLength: 0,
          lastSpokeAt: -1,
          contributionScore: 0,
          topicRelevance: 0,
          responsePattern: 'balanced'
        })
        return
      }
      
      const totalLength = speakerMessages.reduce((sum, m) => sum + m.text.length, 0)
      const avgLength = totalLength / speakerMessages.length
      
      // 最後の発言位置
      const lastIndex = messages.findLastIndex(m => m.who === speaker)
      
      // 貢献度スコア（発言数と質のバランス）
      const contribution = (speakerMessages.length / messages.length) * 
                          (avgLength / 100) * 
                          (this.calculateSpeakerTopicRelevance(speakerMessages))
      
      // トピック関連度
      const relevance = this.calculateSpeakerTopicRelevance(speakerMessages)
      
      // 応答パターン判定
      const pattern = this.determineResponsePattern(messages, speaker)
      
      stats.set(speaker, {
        utteranceCount: speakerMessages.length,
        totalTokens: totalLength,
        averageLength: avgLength,
        lastSpokeAt: lastIndex,
        contributionScore: Math.min(contribution, 1),
        topicRelevance: relevance,
        responsePattern: pattern
      })
    })
    
    return stats
  }
  
  /**
   * フェーズ判定
   */
  private determinePhase(
    currentTurn: number,
    maxTurns: number,
    messages: Message[]
  ): ConversationPhase {
    const progress = currentTurn / maxTurns
    
    if (progress < 0.15) return ConversationPhase.OPENING
    if (progress < 0.3) return ConversationPhase.WARM_UP
    if (progress < 0.7) return ConversationPhase.DEVELOPMENT
    if (progress < 0.85) return ConversationPhase.PEAK
    return ConversationPhase.CLOSING
  }
  
  /**
   * フェーズ内進行度
   */
  private calculatePhaseProgress(
    currentTurn: number,
    maxTurns: number,
    phase: ConversationPhase
  ): number {
    const progress = currentTurn / maxTurns
    
    switch (phase) {
      case ConversationPhase.OPENING:
        return Math.min(progress / 0.15, 1)
      case ConversationPhase.WARM_UP:
        return Math.min((progress - 0.15) / 0.15, 1)
      case ConversationPhase.DEVELOPMENT:
        return Math.min((progress - 0.3) / 0.4, 1)
      case ConversationPhase.PEAK:
        return Math.min((progress - 0.7) / 0.15, 1)
      case ConversationPhase.CLOSING:
        return Math.min((progress - 0.85) / 0.15, 1)
    }
  }
  
  /**
   * 推奨事項の生成
   */
  private generateRecommendations(params: any): Recommendation[] {
    const recommendations: Recommendation[] = []
    
    // 勢いが落ちている場合
    if (params.momentum < 0.3) {
      recommendations.push({
        type: 'energy_boost',
        urgency: 'high',
        message: '会話の勢いが落ちています。新しい角度から話題を展開しましょう。',
        targetSpeaker: 'boke'
      })
    }
    
    // トピックから逸脱している場合
    if (params.topicDrift > 0.7) {
      recommendations.push({
        type: 'topic_shift',
        urgency: 'medium',
        message: '話題が逸れています。ディレクターの介入を検討してください。',
        targetSpeaker: 'director'
      })
    }
    
    // 緊張度が高い場合
    if (params.tensionLevel > 0.8) {
      recommendations.push({
        type: 'intervention',
        urgency: 'high',
        message: '緊張度が高まっています。和らげる発言が必要です。',
        targetSpeaker: 'director'
      })
    }
    
    return recommendations
  }
  
  /**
   * 次の発言者予測
   */
  private predictNextSpeaker(
    messages: Message[],
    speakerStats: Map<RoleKey, SpeakerStatistics>,
    phase: ConversationPhase,
    metrics: any
  ): { speaker: RoleKey; confidence: number; reasons: string[] } {
    const reasons: string[] = []
    let predictedSpeaker: RoleKey = 'boke'
    let confidence = 0.5
    
    const lastSpeaker = messages.length > 0 
      ? messages[messages.length - 1].who 
      : null
    
    // ディレクター介入の判定
    if (metrics.topicDrift > 0.7 || metrics.tensionLevel > 0.8) {
      predictedSpeaker = 'director'
      confidence = 0.9
      reasons.push('会話の調整が必要')
      
      if (metrics.topicDrift > 0.7) {
        reasons.push('トピックから逸脱している')
      }
      if (metrics.tensionLevel > 0.8) {
        reasons.push('緊張度が高い')
      }
    }
    // 通常の流れ
    else if (lastSpeaker === 'boke') {
      predictedSpeaker = 'tsukkomi'
      confidence = 0.85
      reasons.push('ボケに対するツッコミが期待される')
    }
    else if (lastSpeaker === 'tsukkomi') {
      predictedSpeaker = 'boke'
      confidence = 0.8
      reasons.push('ツッコミへの返しが必要')
    }
    else if (lastSpeaker === 'director') {
      // ディレクターの指示に基づく
      const bokeStats = speakerStats.get('boke')!
      const tsukStats = speakerStats.get('tsukkomi')!
      
      if (bokeStats.utteranceCount < tsukStats.utteranceCount) {
        predictedSpeaker = 'boke'
        reasons.push('ボケの発言が少ない')
      } else {
        predictedSpeaker = 'tsukkomi'
        reasons.push('バランスを考慮')
      }
      confidence = 0.7
    }
    
    // フェーズによる調整
    if (phase === ConversationPhase.OPENING) {
      confidence *= 0.9
      reasons.push('序盤は流動的')
    } else if (phase === ConversationPhase.PEAK) {
      confidence *= 1.1
      reasons.push('盛り上がり時は予測しやすい')
    }
    
    return {
      speaker: predictedSpeaker,
      confidence: Math.min(confidence, 1),
      reasons
    }
  }
  
  // ヘルパーメソッド
  private calculateIntervals(messages: Message[]): number {
    if (messages.length < 2) return 0
    
    const intervals: number[] = []
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].timestamp && messages[i-1].timestamp) {
        intervals.push(messages[i].timestamp - messages[i-1].timestamp)
      }
    }
    
    if (intervals.length === 0) return 0
    
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avg, 2), 0) / intervals.length
    
    return Math.sqrt(variance)
  }
  
  private checkReference(prev: string, curr: string): boolean {
    // 簡易的な参照チェック
    const prevWords = this.extractKeywords(prev)
    const currWords = this.extractKeywords(curr)
    
    let commonWords = 0
    prevWords.forEach(word => {
      if (currWords.has(word)) commonWords++
    })
    
    return commonWords > 0
  }
  
  private calculateRepetitionRate(messages: Message[]): number {
    if (messages.length < 2) return 0
    
    const recent = messages.slice(-5)
    let repetitions = 0
    
    for (let i = 1; i < recent.length; i++) {
      const prevWords = this.extractKeywords(recent[i-1].text)
      const currWords = this.extractKeywords(recent[i].text)
      
      prevWords.forEach(word => {
        if (currWords.has(word) && word.length > 2) {
          repetitions++
        }
      })
    }
    
    return Math.min(repetitions / (recent.length * 3), 1)
  }
  
  private calculateSpeakerTopicRelevance(messages: Message[]): number {
    if (messages.length === 0 || this.topicKeywords.size === 0) return 0
    
    let relevantCount = 0
    let totalWords = 0
    
    messages.forEach(msg => {
      const words = this.extractKeywords(msg.text)
      totalWords += words.size
      
      words.forEach(word => {
        if (this.topicKeywords.has(word)) relevantCount++
      })
    })
    
    return totalWords > 0 ? relevantCount / totalWords : 0
  }
  
  private determineResponsePattern(
    messages: Message[],
    speaker: RoleKey
  ): 'leading' | 'following' | 'balanced' {
    const speakerIndices = messages
      .map((m, i) => m.who === speaker ? i : -1)
      .filter(i => i !== -1)
    
    if (speakerIndices.length < 2) return 'balanced'
    
    let leadingCount = 0
    let followingCount = 0
    
    speakerIndices.forEach(index => {
      if (index === 0) {
        leadingCount++
      } else if (index > 0) {
        const prevSpeaker = messages[index - 1].who
        if (prevSpeaker === 'director') {
          leadingCount++
        } else {
          followingCount++
        }
      }
    })
    
    if (leadingCount > followingCount * 1.5) return 'leading'
    if (followingCount > leadingCount * 1.5) return 'following'
    return 'balanced'
  }
}