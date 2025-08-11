// src/lib/prompt-evolution/AdaptivePromptSystem.ts
// Phase 3: 自己改善型プロンプトシステム - Part 1/2

import type { RoleKey, AgentConfig } from '@/types'

/**
 * プロンプトバリアント：各プロンプトのバージョン
 */
export interface PromptVariant {
  id: string
  roleKey: RoleKey
  version: number
  generation: number
  
  // プロンプト内容
  systemPrompt: string
  stylePrompt: string
  temperature: number
  
  // パフォーマンス指標
  performance: PromptPerformance
  
  // メタデータ
  createdAt: number
  parentId?: string  // 親バリアントのID
  mutationType?: 'manual' | 'auto' | 'crossover' | 'mutation'
  
  // 実験情報
  experimentCount: number
  isActive: boolean
  isBaseline: boolean  // ベースライン（比較基準）かどうか
}

/**
 * プロンプトのパフォーマンス指標
 */
export interface PromptPerformance {
  // 基本指標
  totalUses: number
  successRate: number  // 成功した会話の割合
  avgQualityScore: number  // 平均品質スコア (0-1)
  
  // 詳細指標
  avgResponseLength: number
  avgResponseTime: number
  coherenceScore: number
  engagementScore: number
  topicRelevanceScore: number
  
  // ユーザー評価
  userRatings: UserRating[]
  avgUserRating: number
  
  // 統計的信頼性
  confidenceInterval: number  // 信頼区間
  statisticalSignificance?: number  // 統計的有意性
}

/**
 * ユーザー評価
 */
export interface UserRating {
  timestamp: number
  score: number  // 1-5
  feedback?: string
  conversationId: string
}

/**
 * 実験結果
 */
export interface ExperimentResult {
  variantId: string
  conversationId: string
  timestamp: number
  
  // 会話の品質指標
  qualityMetrics: {
    coherence: number
    engagement: number
    humor: number
    topicRelevance: number
    overall: number
  }
  
  // 応答特性
  responseMetrics: {
    avgLength: number
    avgTime: number
    turnCount: number
  }
  
  // ユーザーフィードバック
  userFeedback?: {
    rating: number
    comment?: string
  }
}

/**
 * プロンプト進化の設定
 */
export interface EvolutionConfig {
  // 実験設定
  explorationRate: number  // 新しいバリアントを試す確率 (0-1)
  minSampleSize: number   // 最小サンプルサイズ
  confidenceThreshold: number  // 信頼度の閾値
  
  // 進化設定
  mutationRate: number  // 突然変異率
  crossoverRate: number  // 交叉率
  selectionPressure: number  // 選択圧
  
  // 制限
  maxVariants: number  // 最大バリアント数
  maxGenerations: number  // 最大世代数
  
  // 自動改善
  autoImprove: boolean  // 自動改善を有効にするか
  improvementThreshold: number  // 改善と判断する閾値
}

/**
 * 自己改善型プロンプトシステム
 */
export class AdaptivePromptSystem {
  private variants: Map<string, PromptVariant[]> = new Map()  // roleKey -> variants
  private currentBest: Map<RoleKey, PromptVariant> = new Map()
  private experiments: ExperimentResult[] = []
  private config: EvolutionConfig
  
  constructor(config?: Partial<EvolutionConfig>) {
    this.config = {
      explorationRate: 0.2,
      minSampleSize: 5,
      confidenceThreshold: 0.95,
      mutationRate: 0.1,
      crossoverRate: 0.3,
      selectionPressure: 1.5,
      maxVariants: 10,
      maxGenerations: 20,
      autoImprove: true,
      improvementThreshold: 0.1,
      ...config
    }
  }
  
  /**
   * 初期プロンプトを登録
   */
  registerBaselinePrompt(role: RoleKey, config: AgentConfig): void {
    const baseline: PromptVariant = {
      id: `${role}_v1_baseline`,
      roleKey: role,
      version: 1,
      generation: 1,
      systemPrompt: config.promptSystem,
      stylePrompt: config.promptStyle,
      temperature: config.temperature,
      performance: this.createEmptyPerformance(),
      createdAt: Date.now(),
      mutationType: 'manual',
      experimentCount: 0,
      isActive: true,
      isBaseline: true
    }
    
    const variants = this.variants.get(role) || []
    variants.push(baseline)
    this.variants.set(role, variants)
    this.currentBest.set(role, baseline)
  }
  
  /**
   * プロンプトを選択（探索と活用のバランス）
   */
  selectPrompt(role: RoleKey): PromptVariant {
    const variants = this.variants.get(role) || []
    if (variants.length === 0) {
      throw new Error(`No variants registered for role: ${role}`)
    }
    
    // 探索：新しいバリアントを試す
    if (Math.random() < this.config.explorationRate) {
      return this.selectExplorationVariant(role, variants)
    }
    
    // 活用：現在のベストを使用
    return this.currentBest.get(role) || variants[0]
  }
  
  /**
   * 探索用バリアントの選択（UCBアルゴリズム）
   */
  private selectExplorationVariant(role: RoleKey, variants: PromptVariant[]): PromptVariant {
    const activeVariants = variants.filter(v => v.isActive)
    
    // UCB (Upper Confidence Bound) スコアを計算
    let bestVariant = activeVariants[0]
    let bestScore = -Infinity
    
    const totalTrials = activeVariants.reduce((sum, v) => sum + v.experimentCount, 0)
    
    for (const variant of activeVariants) {
      // 試行回数が少ないバリアントを優先
      if (variant.experimentCount < this.config.minSampleSize) {
        return variant
      }
      
      // UCBスコア = 平均報酬 + 探索ボーナス
      const avgReward = variant.performance.avgQualityScore
      const explorationBonus = Math.sqrt(
        2 * Math.log(totalTrials) / variant.experimentCount
      )
      const ucbScore = avgReward + explorationBonus
      
      if (ucbScore > bestScore) {
        bestScore = ucbScore
        bestVariant = variant
      }
    }
    
    return bestVariant
  }
  
  /**
   * 実験結果を記録
   */
  recordExperiment(result: ExperimentResult): void {
    this.experiments.push(result)
    
    // バリアントのパフォーマンスを更新
    const variant = this.findVariantById(result.variantId)
    if (variant) {
      this.updateVariantPerformance(variant, result)
      
      // 自動改善が有効な場合
      if (this.config.autoImprove) {
        this.checkAndImprove(variant)
      }
    }
  }
  
  /**
   * バリアントのパフォーマンスを更新（修正版）
   */
  private updateVariantPerformance(variant: PromptVariant, result: ExperimentResult): void {
    const perf = variant.performance
    const n = perf.totalUses
    
    // 移動平均で更新
    perf.totalUses++
    perf.avgQualityScore = (perf.avgQualityScore * n + result.qualityMetrics.overall) / (n + 1)
    perf.coherenceScore = (perf.coherenceScore * n + result.qualityMetrics.coherence) / (n + 1)
    perf.engagementScore = (perf.engagementScore * n + result.qualityMetrics.engagement) / (n + 1)
    perf.topicRelevanceScore = (perf.topicRelevanceScore * n + result.qualityMetrics.topicRelevance) / (n + 1)
    
    perf.avgResponseLength = (perf.avgResponseLength * n + result.responseMetrics.avgLength) / (n + 1)
    perf.avgResponseTime = (perf.avgResponseTime * n + result.responseMetrics.avgTime) / (n + 1)
    
    // ユーザー評価を追加
    if (result.userFeedback) {
      perf.userRatings.push({
        timestamp: result.timestamp,
        score: result.userFeedback.rating,
        feedback: result.userFeedback.comment,
        conversationId: result.conversationId
      })
      
      perf.avgUserRating = perf.userRatings.reduce((sum, r) => sum + r.score, 0) / perf.userRatings.length
    }
    
    // 統計的信頼性を計算
    if (perf.totalUses >= this.config.minSampleSize) {
      perf.confidenceInterval = this.calculateConfidenceInterval(variant)
    }
    
    variant.experimentCount++
    
    // ベストプロンプトを更新
    this.updateBestPrompt(variant.roleKey)
    
    // ログ出力を追加
    console.log(`[AdaptivePrompt] Updated ${variant.id}: score=${perf.avgQualityScore.toFixed(3)}, uses=${perf.totalUses}`)
  }
  
  /**
   * 改善が必要かチェックして自動改善（修正版）
   */
  private async checkAndImprove(variant: PromptVariant): Promise<void> {
    // 修正：より積極的に改善を試みる
    
    // 最小1回の実験でも改善を検討
    if (variant.experimentCount < 1) {
      return
    }
    
    // パフォーマンスが低い、または中程度でも改善を試みる
    if (variant.performance.avgQualityScore < 0.7) {  // 閾値を上げる（0.6→0.7）
      console.log(`[AdaptivePrompt] Attempting to improve ${variant.id} (score: ${variant.performance.avgQualityScore.toFixed(3)})`)
      
      // 新しいバリアントを生成
      const improved = await this.generateImprovedVariant(variant)
      if (improved) {
        this.addVariant(improved)
        console.log(`[AdaptivePrompt] Generated improved variant: ${improved.id}`)
      }
    }
    
    // 追加：一定回数実験したら、成功していても変異体を作る
    if (variant.experimentCount >= 3 && variant.experimentCount % 3 === 0) {
      // 3回ごとに変異体を生成（多様性確保）
      const mutant = this.mutateVariant(variant)
      this.addVariant(mutant)
      console.log(`[AdaptivePrompt] Generated mutant for diversity: ${mutant.id}`)
    }
  }
  
  /**
   * 改善されたバリアントを生成
   */
  async generateImprovedVariant(parent: PromptVariant): Promise<PromptVariant | null> {
    const role = parent.roleKey
    const variants = this.variants.get(role) || []
    
    // 最大世代数に達している場合
    if (parent.generation >= this.config.maxGenerations) {
      return null
    }
    
    // 最大バリアント数に達している場合は最悪のものを削除
    if (variants.length >= this.config.maxVariants) {
      this.pruneWorstVariant(role)
    }
    
    // 改善戦略を選択
    const strategy = Math.random()
    
    if (strategy < this.config.mutationRate) {
      // 突然変異：小さな変更を加える
      return this.mutateVariant(parent)
    } else if (strategy < this.config.mutationRate + this.config.crossoverRate) {
      // 交叉：他の良いバリアントと組み合わせる
      return this.crossoverVariants(parent, role)
    } else {
      // 分析に基づく改善
      return this.analyzeAndImprove(parent)
    }
  }

  // src/lib/prompt-evolution/AdaptivePromptSystem.ts
// Phase 3: 自己改善型プロンプトシステム - Part 2/2 (続き)

  /**
   * 突然変異：プロンプトに小さな変更を加える（修正版）
   */
  private mutateVariant(parent: PromptVariant): PromptVariant {
    const mutations = [
      // より多様な変異を追加
      // スタイルの調整
      (p: string) => p + '\n簡潔に一言で。',
      (p: string) => p + '\n具体例を1つ含めて。',
      (p: string) => p + '\nユーモアを多めに。',
      (p: string) => p + '\n相手の発言を受けて返答。',
      (p: string) => p + '\n独創的な視点で。',
      (p: string) => p.replace(/。/g, '。\n'),
      (p: string) => p.replace(/簡潔に/g, '詳しく'),
      (p: string) => p.replace(/詳しく/g, '簡潔に'),
      
      // システムプロンプトの調整
      (p: string) => p + '\n前の発言との関連性を重視。',
      (p: string) => p + '\n話題から逸れすぎないよう注意。',
      (p: string) => p + '\n積極的に質問を投げかける。',
      
      // 温度の調整（より大きな変更）
      () => ({ temperature: Math.min(1, parent.temperature + 0.15) }),
      () => ({ temperature: Math.max(0.1, parent.temperature - 0.15) }),
      () => ({ temperature: 0.5 + Math.random() * 0.5 })  // ランダム化
    ]
    
    const mutation = mutations[Math.floor(Math.random() * mutations.length)]
    
    let newSystemPrompt = parent.systemPrompt
    let newStylePrompt = parent.stylePrompt
    let newTemperature = parent.temperature
    
    if (typeof mutation === 'function' && mutation.length === 1) {
      // プロンプトの変更（50%の確率でシステム、50%でスタイル）
      if (Math.random() < 0.5) {
        newSystemPrompt = mutation(parent.systemPrompt)
      } else {
        newStylePrompt = mutation(parent.stylePrompt)
      }
    } else if (typeof mutation === 'function') {
      // 温度の変更
      const result = mutation()
      newTemperature = result.temperature
    }
    
    // 追加：時々大きな変更を加える（10%の確率）
    if (Math.random() < 0.1) {
      console.log(`[AdaptivePrompt] Applying major mutation to ${parent.id}`)
      newStylePrompt = '新しいスタイル：' + newStylePrompt
      newTemperature = Math.random() * 0.8 + 0.2  // 0.2〜1.0のランダム値
    }
    
    return {
      id: `${parent.roleKey}_v${parent.version + 1}_mut_${Date.now()}`,
      roleKey: parent.roleKey,
      version: parent.version + 1,
      generation: parent.generation + 1,
      systemPrompt: newSystemPrompt,
      stylePrompt: newStylePrompt,
      temperature: newTemperature,
      performance: this.createEmptyPerformance(),
      createdAt: Date.now(),
      parentId: parent.id,
      mutationType: 'mutation',
      experimentCount: 0,
      isActive: true,
      isBaseline: false
    }
  }
  
  /**
   * 交叉：複数のバリアントを組み合わせる
   */
  private crossoverVariants(parent: PromptVariant, role: RoleKey): PromptVariant | null {
    const variants = this.variants.get(role) || []
    const goodVariants = variants
      .filter(v => v.id !== parent.id && v.performance.avgQualityScore > 0.6)
      .sort((a, b) => b.performance.avgQualityScore - a.performance.avgQualityScore)
    
    if (goodVariants.length === 0) {
      return null
    }
    
    const other = goodVariants[0]
    
    // 親から良い部分を組み合わせる
    return {
      id: `${role}_v${Math.max(parent.version, other.version) + 1}_cross_${Date.now()}`,
      roleKey: role,
      version: Math.max(parent.version, other.version) + 1,
      generation: Math.max(parent.generation, other.generation) + 1,
      systemPrompt: parent.performance.coherenceScore > other.performance.coherenceScore 
        ? parent.systemPrompt 
        : other.systemPrompt,
      stylePrompt: parent.performance.engagementScore > other.performance.engagementScore
        ? parent.stylePrompt
        : other.stylePrompt,
      temperature: (parent.temperature + other.temperature) / 2,
      performance: this.createEmptyPerformance(),
      createdAt: Date.now(),
      parentId: parent.id,
      mutationType: 'crossover',
      experimentCount: 0,
      isActive: true,
      isBaseline: false
    }
  }
  
  /**
   * 分析に基づく改善
   */
  private async analyzeAndImprove(parent: PromptVariant): Promise<PromptVariant> {
    // 問題点を分析
    const issues: string[] = []
    
    if (parent.performance.coherenceScore < 0.5) {
      issues.push('一貫性が低い')
    }
    if (parent.performance.engagementScore < 0.5) {
      issues.push('エンゲージメントが低い')
    }
    if (parent.performance.topicRelevanceScore < 0.5) {
      issues.push('話題への関連性が低い')
    }
    if (parent.performance.avgResponseLength < 30) {
      issues.push('応答が短すぎる')
    }
    if (parent.performance.avgResponseLength > 200) {
      issues.push('応答が長すぎる')
    }
    
    // 改善案を生成
    let improvedSystem = parent.systemPrompt
    let improvedStyle = parent.stylePrompt
    
    if (issues.includes('一貫性が低い')) {
      improvedSystem += '\n前の発言を踏まえて応答してください。'
    }
    if (issues.includes('エンゲージメントが低い')) {
      improvedStyle += '\n相手の発言に積極的に反応してください。'
    }
    if (issues.includes('話題への関連性が低い')) {
      improvedSystem += '\n話題から逸れないよう注意してください。'
    }
    if (issues.includes('応答が短すぎる')) {
      improvedStyle += '\nもう少し詳しく説明してください。'
    }
    if (issues.includes('応答が長すぎる')) {
      improvedStyle += '\n簡潔にまとめてください。'
    }
    
    return {
      id: `${parent.roleKey}_v${parent.version + 1}_improved_${Date.now()}`,
      roleKey: parent.roleKey,
      version: parent.version + 1,
      generation: parent.generation + 1,
      systemPrompt: improvedSystem,
      stylePrompt: improvedStyle,
      temperature: parent.temperature,
      performance: this.createEmptyPerformance(),
      createdAt: Date.now(),
      parentId: parent.id,
      mutationType: 'auto',
      experimentCount: 0,
      isActive: true,
      isBaseline: false
    }
  }
  
  /**
   * ベストプロンプトを更新
   */
  private updateBestPrompt(role: RoleKey): void {
    const variants = this.variants.get(role) || []
    const eligibleVariants = variants.filter(v => 
      v.isActive && v.experimentCount >= this.config.minSampleSize
    )
    
    if (eligibleVariants.length === 0) {
      return
    }
    
    // 最高スコアのバリアントを選択
    const best = eligibleVariants.reduce((best, v) => 
      v.performance.avgQualityScore > best.performance.avgQualityScore ? v : best
    )
    
    const current = this.currentBest.get(role)
    
    // 統計的に有意な改善がある場合のみ更新
    if (!current || this.isSignificantlyBetter(best, current)) {
      this.currentBest.set(role, best)
      console.log(`[AdaptivePrompt] New best prompt for ${role}: ${best.id} (score: ${best.performance.avgQualityScore.toFixed(3)})`)
    }
  }
  
  /**
   * 統計的に有意な改善かどうか判定
   */
  private isSignificantlyBetter(candidate: PromptVariant, current: PromptVariant): boolean {
    // スコアの差
    const scoreDiff = candidate.performance.avgQualityScore - current.performance.avgQualityScore
    
    // 改善閾値を超えているか
    if (scoreDiff < this.config.improvementThreshold) {
      return false
    }
    
    // 統計的有意性をチェック（簡易版：t検定の代わり）
    const confidence = candidate.performance.confidenceInterval || 0
    return confidence > this.config.confidenceThreshold
  }
  
  /**
   * 最悪のバリアントを削除
   */
  private pruneWorstVariant(role: RoleKey): void {
    const variants = this.variants.get(role) || []
    
    if (variants.length <= 1) {
      return
    }
    
    // ベースラインは削除しない
    const candidates = variants.filter(v => !v.isBaseline)
    
    if (candidates.length === 0) {
      return
    }
    
    // 最悪のバリアントを見つける
    const worst = candidates.reduce((worst, v) => 
      v.performance.avgQualityScore < worst.performance.avgQualityScore ? v : worst
    )
    
    // 削除
    const index = variants.indexOf(worst)
    if (index !== -1) {
      variants.splice(index, 1)
      console.log(`[AdaptivePrompt] Pruned worst variant: ${worst.id}`)
    }
  }
  
  /**
   * バリアントを追加
   */
  private addVariant(variant: PromptVariant): void {
    const variants = this.variants.get(variant.roleKey) || []
    variants.push(variant)
    this.variants.set(variant.roleKey, variants)
    console.log(`[AdaptivePrompt] Added new variant: ${variant.id}`)
  }
  
  /**
   * IDでバリアントを検索
   */
  private findVariantById(id: string): PromptVariant | undefined {
    for (const variants of this.variants.values()) {
      const found = variants.find(v => v.id === id)
      if (found) {
        return found
      }
    }
    return undefined
  }
  
  /**
   * 信頼区間を計算
   */
  private calculateConfidenceInterval(variant: PromptVariant): number {
    const n = variant.performance.totalUses
    if (n < 2) {
      return 0
    }
    
    // 標準誤差の簡易計算
    const se = Math.sqrt(variant.performance.avgQualityScore * (1 - variant.performance.avgQualityScore) / n)
    
    // 95%信頼区間（z値 = 1.96）
    const margin = 1.96 * se
    
    // 信頼度を0-1の範囲で返す
    return Math.max(0, Math.min(1, 1 - margin))
  }
  
  /**
   * 空のパフォーマンスオブジェクトを作成
   */
  private createEmptyPerformance(): PromptPerformance {
    return {
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
    }
  }
  
  /**
   * 現在の状態をエクスポート
   */
  exportState(): {
    variants: Map<string, PromptVariant[]>
    currentBest: Map<RoleKey, PromptVariant>
    experiments: ExperimentResult[]
  } {
    return {
      variants: this.variants,
      currentBest: this.currentBest,
      experiments: this.experiments
    }
  }
  
  /**
   * 状態をインポート
   */
  importState(state: {
    variants: Map<string, PromptVariant[]>
    currentBest: Map<RoleKey, PromptVariant>
    experiments: ExperimentResult[]
  }): void {
    this.variants = state.variants
    this.currentBest = state.currentBest
    this.experiments = state.experiments
  }
  
  /**
   * 進化の統計情報を取得
   */
  getEvolutionStats(role: RoleKey): {
    totalVariants: number
    activeVariants: number
    maxGeneration: number
    bestScore: number
    improvementRate: number
    experimentCount: number
  } {
    const variants = this.variants.get(role) || []
    const best = this.currentBest.get(role)
    const baseline = variants.find(v => v.isBaseline)
    
    const stats = {
      totalVariants: variants.length,
      activeVariants: variants.filter(v => v.isActive).length,
      maxGeneration: Math.max(...variants.map(v => v.generation)),
      bestScore: best?.performance.avgQualityScore || 0,
      improvementRate: 0,
      experimentCount: variants.reduce((sum, v) => sum + v.experimentCount, 0)
    }
    
    if (baseline && best) {
      stats.improvementRate = 
        (best.performance.avgQualityScore - baseline.performance.avgQualityScore) / 
        baseline.performance.avgQualityScore
    }
    
    return stats
  }
}