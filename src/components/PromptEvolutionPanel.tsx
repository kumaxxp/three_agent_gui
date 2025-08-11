// src/components/PromptEvolutionPanel.tsx
// Phase 3: プロンプト進化の可視化パネル

import React, { useState } from 'react'
import type { PromptVariant, ExperimentResult } from '@/lib/prompt-evolution/AdaptivePromptSystem'
import type { RoleKey } from '@/types'

interface PromptEvolutionPanelProps {
  variants: Map<string, PromptVariant[]>
  currentBest: Map<RoleKey, PromptVariant>
  evolutionStats: Map<RoleKey, any>
  onVariantSelect?: (variant: PromptVariant) => void
  onUserRating?: (variantId: string, rating: number, comment?: string) => void
}

export function PromptEvolutionPanel({
  variants,
  currentBest,
  evolutionStats,
  onVariantSelect,
  onUserRating
}: PromptEvolutionPanelProps) {
  const [selectedRole, setSelectedRole] = useState<RoleKey>('boke')
  const [selectedVariant, setSelectedVariant] = useState<PromptVariant | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [userRating, setUserRating] = useState(3)
  const [userComment, setUserComment] = useState('')
  
  const roles: RoleKey[] = ['boke', 'tsukkomi', 'director']
  const roleLabels = {
    boke: 'ボケ',
    tsukkomi: 'ツッコミ',
    director: 'ディレクター'
  }
  
  const roleVariants = variants.get(selectedRole) || []
  const stats = evolutionStats.get(selectedRole)
  const best = currentBest.get(selectedRole)
  
  // 世代ごとにグループ化
  const generationGroups = new Map<number, PromptVariant[]>()
  roleVariants.forEach(v => {
    const gen = v.generation
    if (!generationGroups.has(gen)) {
      generationGroups.set(gen, [])
    }
    generationGroups.get(gen)!.push(v)
  })
  
  return (
    <div className="space-y-4">
      {/* 役割選択タブ */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">🧬 プロンプト進化</h3>
        <div className="flex gap-2 mb-4">
          {roles.map(role => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-3 py-1 rounded-lg text-xs transition-all ${
                selectedRole === role
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {roleLabels[role]}
            </button>
          ))}
        </div>
        
        {/* 進化統計 */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-600">総バリアント数</div>
              <div className="text-lg font-bold">{stats.totalVariants}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-600">最大世代</div>
              <div className="text-lg font-bold">第{stats.maxGeneration}世代</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-gray-600">最高スコア</div>
              <div className="text-lg font-bold">{(stats.bestScore * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-gray-600">改善率</div>
              <div className="text-lg font-bold">
                {stats.improvementRate > 0 ? '+' : ''}{(stats.improvementRate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </section>
      
      {/* 進化ツリー */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">📊 進化ツリー</h3>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {Array.from(generationGroups.entries())
            .sort(([a], [b]) => a - b)
            .map(([generation, genVariants]) => (
              <div key={generation} className="border-l-2 border-gray-300 pl-4">
                <div className="text-xs font-medium text-gray-600 mb-2">
                  第{generation}世代
                </div>
                <div className="space-y-2">
                  {genVariants.map(variant => (
                    <VariantCard
                      key={variant.id}
                      variant={variant}
                      isBest={best?.id === variant.id}
                      isSelected={selectedVariant?.id === variant.id}
                      onClick={() => {
                        setSelectedVariant(variant)
                        setShowDetails(true)
                        onVariantSelect?.(variant)
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>
      
      {/* バリアント詳細 */}
      {showDetails && selectedVariant && (
        <section className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">📝 バリアント詳細</h3>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-600 mb-1">ID</div>
              <div className="text-xs font-mono bg-gray-50 p-2 rounded">
                {selectedVariant.id}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-600 mb-1">システムプロンプト</div>
              <div className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                {selectedVariant.systemPrompt}
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-600 mb-1">スタイルプロンプト</div>
              <div className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                {selectedVariant.stylePrompt}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-gray-600">温度</div>
                <div className="text-sm font-medium">{selectedVariant.temperature.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">実験回数</div>
                <div className="text-sm font-medium">{selectedVariant.experimentCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">変異タイプ</div>
                <div className="text-sm font-medium">
                  {selectedVariant.mutationType === 'manual' ? '手動' :
                   selectedVariant.mutationType === 'auto' ? '自動' :
                   selectedVariant.mutationType === 'mutation' ? '突然変異' :
                   selectedVariant.mutationType === 'crossover' ? '交叉' : '不明'}
                </div>
              </div>
            </div>
            
            {/* パフォーマンス指標 */}
            <div>
              <div className="text-xs text-gray-600 mb-2">パフォーマンス</div>
              <div className="space-y-1">
                <PerformanceBar
                  label="品質スコア"
                  value={selectedVariant.performance.avgQualityScore}
                  color="bg-purple-500"
                />
                <PerformanceBar
                  label="一貫性"
                  value={selectedVariant.performance.coherenceScore}
                  color="bg-blue-500"
                />
                <PerformanceBar
                  label="エンゲージメント"
                  value={selectedVariant.performance.engagementScore}
                  color="bg-green-500"
                />
                <PerformanceBar
                  label="話題関連性"
                  value={selectedVariant.performance.topicRelevanceScore}
                  color="bg-yellow-500"
                />
              </div>
            </div>
            
            {/* ユーザー評価 */}
            <div>
              <div className="text-xs text-gray-600 mb-2">ユーザー評価</div>
              {selectedVariant.performance.userRatings.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map(star => (
                      <span
                        key={star}
                        className={`text-lg ${
                          star <= Math.round(selectedVariant.performance.avgUserRating)
                            ? 'text-yellow-500'
                            : 'text-gray-300'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-600">
                    ({selectedVariant.performance.avgUserRating.toFixed(1)} / {selectedVariant.performance.userRatings.length}件)
                  </span>
                </div>
              ) : (
                <div className="text-xs text-gray-500">まだ評価がありません</div>
              )}
            </div>
            
            {/* 評価を追加 */}
            <div className="border-t pt-3">
              <div className="text-xs text-gray-600 mb-2">このバリアントを評価</div>
              <div className="flex items-center gap-2 mb-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setUserRating(star)}
                    className={`text-2xl transition-colors ${
                      star <= userRating
                        ? 'text-yellow-500'
                        : 'text-gray-300 hover:text-yellow-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={userComment}
                onChange={(e) => setUserComment(e.target.value)}
                placeholder="コメント（任意）"
                className="w-full text-xs border rounded p-2 mb-2"
                rows={2}
              />
              <button
                onClick={() => {
                  if (onUserRating) {
                    onUserRating(selectedVariant.id, userRating, userComment || undefined)
                    setUserRating(3)
                    setUserComment('')
                  }
                }}
                className="w-full bg-purple-600 text-white text-xs py-2 rounded hover:bg-purple-700"
              >
                評価を送信
              </button>
            </div>
          </div>
        </section>
      )}
      
      {/* 進化グラフ */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">📈 パフォーマンス推移</h3>
        <EvolutionChart variants={roleVariants} />
      </section>
    </div>
  )
}

// バリアントカード
function VariantCard({
  variant,
  isBest,
  isSelected,
  onClick
}: {
  variant: PromptVariant
  isBest: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const statusColor = variant.isActive
    ? variant.performance.avgQualityScore > 0.7
      ? 'bg-green-100'
      : variant.performance.avgQualityScore > 0.4
      ? 'bg-yellow-100'
      : 'bg-red-100'
    : 'bg-gray-100'
  
  return (
    <div
      onClick={onClick}
      className={`p-2 rounded-lg cursor-pointer transition-all ${statusColor} ${
        isSelected ? 'ring-2 ring-purple-500' : ''
      } ${isBest ? 'border-2 border-green-500' : 'border border-gray-200'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">v{variant.version}</span>
          {isBest && (
            <span className="text-xs bg-green-500 text-white px-1 py-0.5 rounded">
              BEST
            </span>
          )}
          {variant.isBaseline && (
            <span className="text-xs bg-gray-500 text-white px-1 py-0.5 rounded">
              BASE
            </span>
          )}
        </div>
        <div className="text-xs text-gray-600">
          {(variant.performance.avgQualityScore * 100).toFixed(0)}%
        </div>
      </div>
      <div className="mt-1 text-[10px] text-gray-500">
        実験: {variant.experimentCount}回
        {variant.mutationType && ` | ${
          variant.mutationType === 'manual' ? '手動' :
          variant.mutationType === 'auto' ? '自動' :
          variant.mutationType === 'mutation' ? '変異' :
          variant.mutationType === 'crossover' ? '交叉' : ''
        }`}
      </div>
    </div>
  )
}

// パフォーマンスバー
function PerformanceBar({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}) {
  const percentage = Math.round(value * 100)
  
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-gray-600 w-20">{label}</div>
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs font-medium w-10 text-right">{percentage}%</div>
    </div>
  )
}

// 進化チャート
function EvolutionChart({ variants }: { variants: PromptVariant[] }) {
  if (variants.length === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-4">
        データがありません
      </div>
    )
  }
  
  // 世代ごとの最高スコアを計算
  const generationScores = new Map<number, number>()
  variants.forEach(v => {
    const gen = v.generation
    const score = v.performance.avgQualityScore
    if (!generationScores.has(gen) || score > generationScores.get(gen)!) {
      generationScores.set(gen, score)
    }
  })
  
  const generations = Array.from(generationScores.entries()).sort(([a], [b]) => a - b)
  const maxGen = Math.max(...generations.map(([g]) => g))
  const maxScore = Math.max(...generations.map(([, s]) => s))
  
  return (
    <div className="relative h-32">
      {/* Y軸ラベル */}
      <div className="absolute left-0 top-0 text-[10px] text-gray-500">100%</div>
      <div className="absolute left-0 bottom-0 text-[10px] text-gray-500">0%</div>
      
      {/* グラフエリア */}
      <div className="ml-8 h-full flex items-end gap-1">
        {generations.map(([gen, score], index) => (
          <div
            key={gen}
            className="flex-1 bg-gradient-to-t from-purple-500 to-purple-300 rounded-t-sm relative group"
            style={{ height: `${(score / Math.max(maxScore, 1)) * 100}%` }}
          >
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
              Gen {gen}: {(score * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
      
      {/* X軸ラベル */}
      <div className="ml-8 mt-1 flex justify-between text-[10px] text-gray-500">
        <span>Gen 1</span>
        <span>Gen {maxGen}</span>
      </div>
    </div>
  )
}