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

    const messages = [
      body.system ? { role: 'system', content: body.system } : null,
      body.style ? { role: 'system', content: `[STYLE]\n${body.style}` } : null,
      { role: 'user', content: body.user },
    ].filter(Boolean)

    const payload = {
      model: body.model,
      temperature: body.temperature ?? 0.7,
      top_p: body.top_p ?? 0.9,
      max_tokens: body.max_tokens ?? 512,
      repetition_penalty: body.repetition_penalty ?? 1.05,
      stream: true,            // ★ 常にSSEで受けてクライアントに透過
      messages,
    }

    const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      return new Response(JSON.stringify({ error: 'upstream_error', status: upstream.status, detail: text }), { status: 502 })
    }

    // ★ SSEをそのままパススルー
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        // Next.jsの中間プロキシで圧縮されないように
        'x-accel-buffering': 'no',
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'proxy_failed', detail: String(e?.message || e) }), { status: 500 })
  }
}
