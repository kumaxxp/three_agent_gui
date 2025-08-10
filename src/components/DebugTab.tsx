'use client'
import { useState } from 'react'

interface DebugLog {
  timestamp: Date
  direction: 'request' | 'response'
  data: any
  url?: string
  status?: number
}

interface DebugTabProps {
  logs: DebugLog[]
  onClear: () => void
}

export function DebugTab({ logs, onClear }: DebugTabProps) {
  const [selectedLog, setSelectedLog] = useState<DebugLog | null>(null)
  const [filter, setFilter] = useState<'all' | 'request' | 'response'>('all')

  const filteredLogs = logs.filter(log => 
    filter === 'all' || log.direction === filter
  )

  const formatJson = (data: any) => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  const getResponseText = (data: any) => {
    if (typeof data === 'string') {
      // SSE形式のレスポンスをパース
      const lines = data.split('\n').filter(line => line.trim())
      const contentParts: string[] = []
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6) // "data: " を削除
            if (jsonStr === '[DONE]') continue
            const parsed = JSON.parse(jsonStr)
            if (parsed.choices?.[0]?.delta?.content) {
              contentParts.push(parsed.choices[0].delta.content)
            }
          } catch (e) {
            // パースエラーは無視
          }
        }
      }
      
      return contentParts.join('')
    }
    return ''
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[600px]">
      {/* ログ一覧 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">デバッグログ</h3>
          <div className="flex items-center gap-2">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="all">すべて</option>
              <option value="request">リクエスト</option>
              <option value="response">レスポンス</option>
            </select>
            <button 
              onClick={onClear}
              className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
            >
              クリア
            </button>
          </div>
        </div>
        
        <div className="overflow-y-auto h-[520px]">
          {filteredLogs.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">
              ログがありません
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div 
                key={index}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedLog === log ? 'bg-blue-50' : ''
                }`}
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs px-2 py-1 rounded ${
                    log.direction === 'request' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {log.direction === 'request' ? '→ リクエスト' : '← レスポンス'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                
                {log.url && (
                  <div className="text-xs text-gray-600 mb-1">
                    {log.url}
                  </div>
                )}
                
                {log.status && (
                  <div className="text-xs text-gray-600 mb-1">
                    Status: {log.status}
                  </div>
                )}

                {log.direction === 'response' && (
                  <div className="text-xs text-gray-800 bg-gray-100 p-2 rounded mt-2">
                    <strong>応答テキスト:</strong><br/>
                    {getResponseText(log.data) || '(テキストなし)'}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 詳細表示 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 p-3 border-b">
          <h3 className="font-semibold">詳細</h3>
        </div>
        
        <div className="overflow-y-auto h-[520px] p-4">
          {selectedLog ? (
            <div>
              <div className="mb-4">
                <h4 className="font-medium mb-2">基本情報</h4>
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <div><strong>方向:</strong> {selectedLog.direction === 'request' ? 'リクエスト' : 'レスポンス'}</div>
                  <div><strong>時刻:</strong> {selectedLog.timestamp.toLocaleString()}</div>
                  {selectedLog.url && <div><strong>URL:</strong> {selectedLog.url}</div>}
                  {selectedLog.status && <div><strong>ステータス:</strong> {selectedLog.status}</div>}
                </div>
              </div>

              {selectedLog.direction === 'response' && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">応答テキスト</h4>
                  <div className="bg-blue-50 p-3 rounded text-sm">
                    <pre className="whitespace-pre-wrap">
                      {getResponseText(selectedLog.data) || '(テキストなし)'}
                    </pre>
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2">Raw Data</h4>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                  {formatJson(selectedLog.data)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-center mt-8">
              ログを選択して詳細を表示
            </div>
          )}
        </div>
      </div>
    </div>
  )
}