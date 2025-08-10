'use client'
import React, { useMemo } from 'react'
import { MetricCard } from './MetricCard'
import type { AgentConfig, RoleKey, Provider, Failover } from '@/types'
import { PROVIDERS } from '@/types'

const MODEL_CATALOG: Record<Provider, string[]> = {
  // ★Ollamaは実IDで統一
  'Ollama': ['gemma3:4b','gemma3:12b','gpt-oss:20b'],
  'LM Studio': ['Gemma3-4B','Gemma3-12B','Qwen3-7B','gpt-oss-20B'],
  'vLLM': ['Gemma3-12B','Qwen3-14B','gpt-oss-20B'],
  'OpenAI互換URL': ['任意モデル名を入力']
}

// 表示名→実IDの正規化（将来ラベル運用しても安全）
function normalizeModelId(provider: Provider, model: string) {
  const m = model.trim()
  if (provider === 'Ollama') {
    const map: Record<string,string> = {
      'Gemma3-4B': 'gemma3:4b',
      'Gemma3-12B': 'gemma3:12b',
      'GPT-OSS 20B': 'gpt-oss:20b',
      'gemma3:4b': 'gemma3:4b',
      'gemma3:12b': 'gemma3:12b',
      'gpt-oss:20b': 'gpt-oss:20b',
    }
    return map[m] ?? m
  }
  return m
}

export function AgentEditor({ role, config, onChange, debugEnabled = false }: { role: RoleKey; config: AgentConfig; onChange: (c: AgentConfig) => void; debugEnabled?: boolean }) {
  const models = useMemo(() => MODEL_CATALOG[config.provider], [config.provider])
  const isCustom = config.provider === 'OpenAI互換URL'

  const [testInput, setTestInput] = React.useState('この話題で一言ボケて: 冷蔵庫が鳴く理由')
  const [testOutput, setTestOutput] = React.useState<string>('')
  const [busy, setBusy] = React.useState(false)

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-8 space-y-4">
        {/* Model Settings */}
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">モデル設定</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Provider</label>
              <select
                className="mt-1 w-full rounded-xl border p-2"
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as Provider
                  onChange({ ...config, provider, model: MODEL_CATALOG[provider][0] })
                }}
              >
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Model</label>
              {isCustom ? (
                <input
                  className="mt-1 w-full rounded-xl border p-2"
                  value={config.model}
                  placeholder="例: my-local-gemma3"
                  onChange={(e) => onChange({ ...config, model: e.target.value })}
                />
              ) : (
                <select
                  className="mt-1 w-full rounded-xl border p-2"
                  value={config.model}
                  onChange={(e) => onChange({ ...config, model: e.target.value })}
                >
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </div>

            {(config.provider === 'LM Studio' || config.provider === 'vLLM' || config.provider === 'OpenAI互換URL') && (
              <>
                <div>
                  <label className="text-xs text-gray-600">Endpoint URL</label>
                  <input
                    className="mt-1 w-full rounded-xl border p-2"
                    placeholder="http://localhost:1234/v1"
                    value={config.endpoint ?? ''}
                    onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">API Key（必要時）</label>
                  <input
                    className="mt-1 w-full rounded-xl border p-2"
                    placeholder="sk-..."
                    value={config.apiKey ?? ''}
                    onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-600">温度</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={config.temperature}
                onChange={(e) => onChange({ ...config, temperature: Number(e.target.value) })}
                className="w-full"
              />
              <div className="text-xs text-gray-500">{config.temperature.toFixed(2)}</div>
            </div>
            <div>
              <label className="text-xs text-gray-600">top_p</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={config.top_p}
                onChange={(e) => onChange({ ...config, top_p: Number(e.target.value) })}
                className="w-full"
              />
              <div className="text-xs text-gray-500">{config.top_p.toFixed(2)}</div>
            </div>
            <div>
              <label className="text-xs text-gray-600">max_tokens</label>
              <input
                type="number" className="mt-1 w-full rounded-xl border p-2"
                value={config.max_tokens}
                onChange={(e) => onChange({ ...config, max_tokens: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">repetition_penalty</label>
              <input
                type="number" step={0.01} className="mt-1 w-full rounded-xl border p-2"
                value={config.repetition_penalty}
                onChange={(e) => onChange({ ...config, repetition_penalty: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">フェイルオーバ</label>
              <select
                className="mt-1 w-full rounded-xl border p-2"
                value={config.failover}
                onChange={(e) => onChange({ ...config, failover: e.target.value as Failover })}
              >
                {(['OFF','SOFT','HARD'] as Failover[]).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">timeout_s</label>
              <input
                type="number" className="mt-1 w-full rounded-xl border p-2"
                value={config.timeout_s}
                onChange={(e) => onChange({ ...config, timeout_s: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">min_tps</label>
              <input
                type="number" className="mt-1 w-full rounded-xl border p-2"
                value={config.min_tps}
                onChange={(e) => onChange({ ...config, min_tps: Number(e.target.value) })}
              />
            </div>
          </div>
        </section>

        {/* Prompt Settings */}
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">プロンプト</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600">System</label>
              <textarea
                className="mt-1 w-full rounded-xl border p-2 h-20"
                value={config.promptSystem}
                onChange={(e) => onChange({ ...config, promptSystem: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Style</label>
              <textarea
                className="mt-1 w-full rounded-xl border p-2 h-16"
                value={config.promptStyle}
                onChange={(e) => onChange({ ...config, promptStyle: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Unit Test (SSE + Abort + 文字数上限) */}
        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">単体テスト（SSE）{debugEnabled && <span className="ml-2 text-xs text-blue-600">デバッグモード</span>}</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border p-2"
              placeholder="テスト入力…"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
            />
            <button
              className="rounded-xl bg-black text-white px-3 py-2 disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setTestOutput('')
                const startedAt = performance.now()
                const ctrl = new AbortController()
                ;(window as any).__agentTestAbort?.abort?.()
                ;(window as any).__agentTestAbort = ctrl

                try {
                  const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      provider: config.provider,
                      endpoint: config.endpoint,
                      apiKey: config.apiKey,
                      model: normalizeModelId(config.provider, config.model),
                      temperature: config.temperature,
                      top_p: config.top_p,
                      max_tokens: config.max_tokens,
                      repetition_penalty: config.repetition_penalty,
                      system: config.promptSystem,
                      style: config.promptStyle,
                      user: testInput,
                      stream: true,
                      enableDebug: debugEnabled
                    }),
                    signal: ctrl.signal,
                  })
                  if (!res.ok || !res.body) {
                    const err = await res.text().catch(()=> '')
                    throw new Error(err || `HTTP ${res.status}`)
                  }

                  const reader = res.body.getReader()
                  const decoder = new TextDecoder('utf-8')
                  let tokenCount = 0
                  let emitted = ''

                  for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    const chunk = decoder.decode(value, { stream: true })

                    // OpenAI互換のSSEは "data: {...}\n\n"
                    for (const line of chunk.split('\n')) {
                      const trimmed = line.trim()
                      if (!trimmed.startsWith('data:')) continue
                      const payload = trimmed.slice(5).trim()
                      if (payload === '[DONE]') continue
                      try {
                        const json = JSON.parse(payload)
                        const delta = json?.choices?.[0]?.delta?.content ?? ''
                        if (delta) {
                          tokenCount += 1
                          emitted += delta
                          setTestOutput((prev) => prev + delta)
                        }
                      } catch {
                        // JSONでない行は無視
                      }
                    }
                  }

                  // 簡易計器更新（latency / tps）
                  const elapsedMs = performance.now() - startedAt
                  const tps = tokenCount > 0 ? (tokenCount / (elapsedMs / 1000)) : 0
                  onChange({ ...config, rtt: Math.round(elapsedMs), tps: Math.round(tps) })
                } catch (e: any) {
                  setTestOutput('【エラー】' + (e?.message || String(e)))
                } finally {
                  setBusy(false)
                }
              }}
            >
              送信
            </button>
            <button
              className="rounded-xl border px-3 py-2 disabled:opacity-50"
              disabled={busy === false}
              onClick={() => {
                ;(window as any).__agentTestAbort?.abort?.()
              }}
            >
              中断
            </button>
          </div>
          <div className="mt-3 rounded-xl border p-3 text-sm text-gray-700 bg-gray-50 whitespace-pre-wrap min-h-[72px]">
            {testOutput || '（ここに逐次表示）'}
          </div>
        </section>
      </div>

      <div className="col-span-4 space-y-4">
        {/* Health / Metrics */}
        <section className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">計器</h3>
            <button
              className="rounded-lg border px-2 py-1 text-xs"
              onClick={() => onChange({ ...config,
                rtt: Math.round(100 + Math.random() * 100),
                tps: Math.round(6 + Math.random() * 6)
              })}
            >
              疎通テスト
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricCard label="Latency (ms)" value={config.rtt} />
            <MetricCard label="tokens/s" value={config.tps} />
            <MetricCard label="Prompt tok" value={128} hint="直近(仮)" />
            <MetricCard label="Completion tok" value={220} hint="直近(仮)" />
            <MetricCard label="出力文字数" value={430} />
            <MetricCard label="重複率" value={'8%'} />
            <MetricCard label="失敗率" value={'0%'} />
          </div>
        </section>

        {/* Info */}
        <section className="rounded-2xl border p-4 text-xs text-gray-600">
          <div className="font-medium mb-2">現在の割当</div>
          <div>Provider: {config.provider}</div>
          <div>Model: {config.model}</div>
          {config.endpoint && <div>Endpoint: {config.endpoint}</div>}
          <div className="mt-2">Failover: {config.failover} / timeout: {config.timeout_s}s / min_tps: {config.min_tps}</div>
        </section>
      </div>
    </div>
  )
}
