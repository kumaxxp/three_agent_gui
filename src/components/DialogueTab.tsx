'use client'
import { useRef, useState, useEffect } from 'react'
import type { AgentConfig, RoleKey } from '@/types'
import { MetricCard } from './MetricCard'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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

export function DialogueTab({ agents }: { agents: Record<RoleKey, AgentConfig> }) {
  const [topic, setTopic] = useState('冷蔵庫が鳴く理由')
  const [turns, setTurns] = useState(6)
  const [order, setOrder] = useState<RoleKey[]>(['director','boke','tsukkomi'])
  const [log, setLog] = useState<{ who: RoleKey; text: string; model: string; provider: string }[]>([
    { who: 'director', text: '本日のテーマは『冷蔵庫が鳴く理由』。まずはボケから一言。', model: agents.director.model, provider: agents.director.provider },
    { who: 'boke', text: '氷の精霊が打楽器の練習してるだけ。', model: agents.boke.model, provider: agents.boke.provider },
    { who: 'tsukkomi', text: '精霊いない。コンプレッサだよ。', model: agents.tsukkomi.model, provider: agents.tsukkomi.provider },
  ])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const logEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  const startMock = () => {
    setLog((prev) => [
      ...prev,
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
              <input className="mt-1 w-full rounded-xl border p-2" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">ターン数</label>
              <input type="number" className="mt-1 w-full rounded-xl border p-2" value={turns} onChange={(e) => setTurns(Number(e.target.value))} />
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-600">順序編集（ドラッグ&ドロップ）</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={(e)=>{
              const {active, over} = e
              if (over && active.id !== over.id) {
                const ids = order.map((x)=>x)
                const oldIndex = ids.indexOf(active.id as any)
                const newIndex = ids.indexOf(over.id as any)
                setOrder(arrayMove(ids, oldIndex, newIndex) as any)
              }
            }}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="flex gap-2 mt-2">
                {order.map((r)=>(
                  <SortablePill key={r} id={r} label={r==='boke'?'ボケ': r==='tsukkomi'?'ツッコミ':'ディレクター'} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-3 flex items-center gap-2">
            <button className="rounded-xl bg-black text-white px-3 py-2" onClick={startMock}>開始（モック）</button>
            <span className="text-xs text-gray-500">※モックは固定応答を追記します</span>
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h3 className="font-semibold text-sm mb-3">対話ログ</h3>
          <div className="space-y-2 max-h-[52vh] overflow-auto pr-2">
            {log.map((l, i) => (
              <div key={i} className={`rounded-xl border p-3 ${i === log.length - 1 ? 'ring-1 ring-black/10' : ''}`}>
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
            <MetricCard label="発話数" value={log.length} />
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
