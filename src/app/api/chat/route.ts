import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

type Body = {
  provider: string
  endpoint?: string
  apiKey?: string
  model: string
  temperature?: number
  top_p?: number
  max_tokens?: number
  repetition_penalty?: number
  system?: string
  style?: string
  user: string
  stream?: boolean
  messages?: Array<{ role: string; content: string }> // ★履歴用フィールド追加
  enableDebug?: boolean // ★デバッグログ有効化フラグ追加
}

// ★デバッグログ収集用のグローバル変数（簡易実装）
let debugLogs: Array<{
  timestamp: Date
  direction: 'request' | 'response'
  data: any
  url?: string
  status?: number
}> = []

// ★デバッグログ取得用エンドポイント
export async function GET() {
  return new Response(JSON.stringify(debugLogs), {
    headers: { 'content-type': 'application/json' }
  })
}

// ★デバッグログクリア用
export async function DELETE() {
  debugLogs = []
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'content-type': 'application/json' }
  })
}

function defaultEndpoint(provider: string | undefined) {
  switch (provider) {
    case 'Ollama': return 'http://localhost:11434/v1'
    case 'LM Studio': return 'http://localhost:1234/v1'
    case 'vLLM': return 'http://localhost:8000/v1'
    default: return undefined
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json()
    const endpoint = body.endpoint || defaultEndpoint(body.provider)
    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'endpoint is required for this provider' }), { status: 400 })
    }
    const url = endpoint.replace(/\/$/, '') + '/chat/completions'

    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (body.apiKey) headers['authorization'] = `Bearer ${body.apiKey}`

    // ★履歴がある場合はそれを使用し、ない場合は従来通り
    const messages = body.messages || [
      body.system ? { role: 'system', content: body.system } : null,
      body.style ? { role: 'system', content: `[STYLE]\n${body.style}` } : null,
      { role: 'user', content: body.user },
    ].filter(Boolean)

    // reasoning系モデルの簡易判定（抑制用）
    const wantsLowReasoning =
      (body.model?.toLowerCase().includes('gpt-oss')) ||
      (body.model?.toLowerCase().includes('reason')) ||
      (body.model?.toLowerCase().includes('deepseek'))

    const payload: any = {
      model: body.model,
      temperature: body.temperature ?? 0.6,
      top_p: body.top_p ?? 0.9,
      max_tokens: body.max_tokens, // ★デフォルト値を削除、クライアントからの値をそのまま使用
      repetition_penalty: body.repetition_penalty ?? 1.05,
      stream: true, // ★SSEで透過
      messages,
      // ★「一言系」で暴走しにくいストッパ
      //stop: ['\n\n', '<|endofthinking|>', '</reasoning>']
      stop: ['<|endofthinking|>', '</reasoning>']
    }

    if (wantsLowReasoning) {
      // ★対応クライアントでは内部reasoningを弱める（無視されても害なし）
      payload.reasoning = { effort: 'low' }
    }

    // ★デバッグログ記録（リクエスト）
    if (body.enableDebug) {
      debugLogs.push({
        timestamp: new Date(),
        direction: 'request',
        data: { ...payload, url },
        url
      })
      // ログが多くなりすぎないよう制限
      if (debugLogs.length > 100) {
        debugLogs = debugLogs.slice(-50)
      }
    }

    // デバッグしたいときは有効化
    // console.log('[proxy] endpoint=', url, 'payload=', JSON.stringify({ model: payload.model, max_tokens: payload.max_tokens }))

    const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      // console.error('[proxy] upstream_error', upstream.status, text)
      return new Response(JSON.stringify({ error: 'upstream_error', status: upstream.status, detail: text }), { status: 502 })
    }

    // ★デバッグ用にレスポンスを収集する場合
    if (body.enableDebug) {
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let responseData = ''
      
      const stream = new ReadableStream({
        start(controller) {
          function pump(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) {
                // ★レスポンス全体をログに記録
                debugLogs.push({
                  timestamp: new Date(),
                  direction: 'response',
                  data: responseData,
                  url,
                  status: upstream.status
                })
                controller.close()
                return
              }
              
              const chunk = decoder.decode(value, { stream: true })
              responseData += chunk
              controller.enqueue(value)
              return pump()
            })
          }
          return pump()
        }
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        },
      })
    }

    // ★SSEそのまま返す（デバッグ無効時）
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'proxy_failed', detail: String(e?.message || e) }), { status: 500 })
  }
}
