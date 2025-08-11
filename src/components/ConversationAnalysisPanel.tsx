// src/components/ConversationAnalysisPanel.tsx
// Phase 2: リアルタイム会話分析パネル

import React from 'react'
import type { DetailedAnalysis, ConversationPhase, Recommendation } from '@/lib/conversation-manager/ConversationAnalyzer'
import type { RoleKey } from '@/types'

interface AnalysisPanelProps {
  analysis: DetailedAnalysis | null
  isRunning: boolean
}

export function ConversationAnalysisPanel({ analysis, isRunning }: AnalysisPanelProps) {
  if (!analysis) {
    return (
      <div className="rounded-2xl border p-4 bg-gray-50">
        <h3 className="font-semibold text-sm mb-3">🔬 リアルタイム分析</h3>
        <p className="text-xs text-gray-500">会話を開始すると分析が表示されます</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* メインメトリクス */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">📊 会話メトリクス</h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricBar 
            label="勢い" 
            value={analysis.momentum} 
            color={getMetricColor(analysis.momentum)}
            icon="🔥"
          />
          <MetricBar 
            label="話題関連度" 
            value={1 - analysis.topicDrift} 
            color={getMetricColor(1 - analysis.topicDrift)}
            icon="🎯"
          />
          <MetricBar 
            label="緊張度" 
            value={analysis.tensionLevel} 
            color={getTensionColor(analysis.tensionLevel)}
            icon="⚡"
            reversed
          />
          <MetricBar 
            label="一貫性" 
            value={analysis.coherence} 
            color={getMetricColor(analysis.coherence)}
            icon="🔗"
          />
          <MetricBar 
            label="エンゲージメント" 
            value={analysis.engagement} 
            color={getMetricColor(analysis.engagement)}
            icon="💬"
          />
          <MetricBar 
            label="ユーモア度" 
            value={analysis.humor} 
            color={getMetricColor(analysis.humor)}
            icon="😄"
          />
        </div>
      </section>

      {/* 会話フェーズ */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">🎭 会話フェーズ</h3>
        <ConversationPhaseIndicator 
          phase={analysis.currentPhase} 
          progress={analysis.phaseProgress}
        />
      </section>

      {/* 次の発言者予測 */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">🔮 次の発言者予測</h3>
        <NextSpeakerPrediction prediction={analysis.nextSpeakerPrediction} />
      </section>

      {/* 発言者統計 */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">👥 発言者分析</h3>
        <SpeakerStatsGrid stats={analysis.speakerStats} />
      </section>

      {/* 推奨事項 */}
      {analysis.recommendations.length > 0 && (
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">💡 推奨事項</h3>
          <RecommendationsList recommendations={analysis.recommendations} />
        </section>
      )}

      {/* 詳細統計 */}
      <section className="rounded-2xl border p-4">
        <h3 className="font-semibold text-sm mb-3">📈 詳細統計</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">平均応答長</span>
            <span className="font-medium">{Math.round(analysis.averageResponseLength)}文字</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">キーワード密度</span>
            <span className="font-medium">{(analysis.topicKeywordDensity * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">発言バランス</span>
            <span className="font-medium">{(analysis.turnTakingBalance * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">繰り返し率</span>
            <span className="font-medium">{(analysis.repetitionRate * 100).toFixed(0)}%</span>
          </div>
        </div>
      </section>
    </div>
  )
}

// メトリクスバーコンポーネント
function MetricBar({ 
  label, 
  value, 
  color, 
  icon,
  reversed = false 
}: { 
  label: string
  value: number
  color: string
  icon: string
  reversed?: boolean
}) {
  const displayValue = Math.round(value * 100)
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          <span>{icon}</span>
          <span className="text-gray-600">{label}</span>
        </span>
        <span className="font-medium">{displayValue}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${displayValue}%` }}
        />
      </div>
      {reversed && value > 0.7 && (
        <div className="text-[10px] text-orange-600">⚠️ 高い</div>
      )}
    </div>
  )
}

// フェーズインジケーター
function ConversationPhaseIndicator({ 
  phase, 
  progress 
}: { 
  phase: ConversationPhase
  progress: number 
}) {
  const phases = [
    { key: 'opening', label: '開始', emoji: '🎬' },
    { key: 'warm_up', label: 'ウォームアップ', emoji: '🔥' },
    { key: 'development', label: '展開', emoji: '📈' },
    { key: 'peak', label: 'ピーク', emoji: '🎯' },
    { key: 'closing', label: '終結', emoji: '🎭' }
  ]
  
  const currentIndex = phases.findIndex(p => p.key === phase)
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {phases.map((p, i) => (
          <div 
            key={p.key}
            className={`flex flex-col items-center ${
              i === currentIndex ? 'text-purple-600' : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{p.emoji}</span>
            <span className="text-[10px] mt-1">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-500"
          style={{ 
            width: `${((currentIndex + progress) / phases.length) * 100}%` 
          }}
        />
      </div>
    </div>
  )
}

// 次の発言者予測
function NextSpeakerPrediction({ 
  prediction 
}: { 
  prediction: { speaker: RoleKey; confidence: number; reasons: string[] } 
}) {
  const speakerLabel = {
    boke: 'ボケ',
    tsukkomi: 'ツッコミ',
    director: 'ディレクター'
  }
  
  const speakerColor = {
    boke: 'bg-blue-100 text-blue-700',
    tsukkomi: 'bg-green-100 text-green-700',
    director: 'bg-gray-100 text-gray-700'
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${speakerColor[prediction.speaker]}`}>
          {speakerLabel[prediction.speaker]}
        </div>
        <div className="text-sm">
          信頼度: <span className="font-medium">{Math.round(prediction.confidence * 100)}%</span>
        </div>
      </div>
      {prediction.reasons.length > 0 && (
        <div className="text-xs text-gray-600 space-y-1">
          {prediction.reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-1">
              <span>•</span>
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 発言者統計グリッド
function SpeakerStatsGrid({ stats }: { stats: Map<RoleKey, any> }) {
  const speakers: RoleKey[] = ['boke', 'tsukkomi', 'director']
  const labels = {
    boke: 'ボケ',
    tsukkomi: 'ツッコミ',
    director: 'ディレクター'
  }
  
  return (
    <div className="grid grid-cols-3 gap-3">
      {speakers.map(speaker => {
        const stat = stats.get(speaker)
        if (!stat) return null
        
        return (
          <div key={speaker} className="text-center space-y-1">
            <div className="text-xs font-medium">{labels[speaker]}</div>
            <div className="text-lg font-bold">{stat.utteranceCount}</div>
            <div className="text-[10px] text-gray-500">発言</div>
            <div className="text-[10px] space-y-1">
              <div>平均{Math.round(stat.averageLength)}文字</div>
              <div>貢献度{Math.round(stat.contributionScore * 100)}%</div>
              <div className={`inline-block px-1 py-0.5 rounded text-[9px] ${
                stat.responsePattern === 'leading' ? 'bg-purple-100' :
                stat.responsePattern === 'following' ? 'bg-blue-100' :
                'bg-gray-100'
              }`}>
                {stat.responsePattern === 'leading' ? 'リード' :
                 stat.responsePattern === 'following' ? 'フォロー' :
                 'バランス'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 推奨事項リスト
function RecommendationsList({ recommendations }: { recommendations: Recommendation[] }) {
  const urgencyColor = {
    low: 'bg-blue-50 border-blue-200',
    medium: 'bg-yellow-50 border-yellow-200',
    high: 'bg-red-50 border-red-200'
  }
  
  const typeIcon = {
    intervention: '🚨',
    topic_shift: '🔄',
    energy_boost: '⚡',
    clarification: '❓'
  }
  
  return (
    <div className="space-y-2">
      {recommendations.map((rec, i) => (
        <div 
          key={i} 
          className={`p-2 rounded-lg border text-xs ${urgencyColor[rec.urgency]}`}
        >
          <div className="flex items-start gap-2">
            <span className="text-lg">{typeIcon[rec.type]}</span>
            <div className="flex-1">
              <div className="font-medium mb-1">{rec.message}</div>
              {rec.targetSpeaker && (
                <div className="text-[10px] text-gray-600">
                  対象: {rec.targetSpeaker === 'boke' ? 'ボケ' :
                        rec.targetSpeaker === 'tsukkomi' ? 'ツッコミ' :
                        'ディレクター'}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ヘルパー関数
function getMetricColor(value: number): string {
  if (value >= 0.7) return 'bg-green-500'
  if (value >= 0.4) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getTensionColor(value: number): string {
  if (value >= 0.7) return 'bg-red-500'
  if (value >= 0.4) return 'bg-yellow-500'
  return 'bg-green-500'
}