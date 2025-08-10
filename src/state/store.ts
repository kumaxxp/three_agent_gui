import { create } from 'zustand'
import type { AgentConfig, RoleKey } from '@/types'

function defaultAgent(name: string): AgentConfig {
  return {
    name,
    provider: 'Ollama',
    model: 'gemma3:4b',
    temperature: name === 'ボケ' ? 0.9 : name === 'ツッコミ' ? 0.4 : 0.6,
    top_p: 0.9,
    max_tokens: 512,
    repetition_penalty: 1.05,
    failover: name === 'ディレクター' ? 'HARD' : name === 'ツッコミ' ? 'OFF' : 'SOFT',
    timeout_s: name === 'ボケ' ? 20 : 30,
    min_tps: name === 'ボケ' ? 8 : 6,
    promptSystem:
      name === 'ボケ'
        ? 'あなたは漫才のボケ担当。大胆・突飛・比喩多め。短文で畳み掛け、下品/攻撃/実名は禁則。'
        : name === 'ツッコミ'
        ? 'あなたはツッコミ担当。ロジカル即応・短文・語尾強め。罵倒と人格否定は禁則。'
        : 'あなたはディレクター。会話の目的/テンポ/安全性を管理し、次の話者を指名する。',
    promptStyle:
      name === 'ボケ'
        ? '平均文長 12-40字。テンポ速め。カタカナ混ぜ。'
        : name === 'ツッコミ'
        ? '一文短く。即応。事実指摘→軽いオチ。'
        : 'メタ視点。段取り指示。3ターンに1回は小結。'
  }
}

type AppState = {
  agents: Record<RoleKey, AgentConfig>;
  setAgent: (role: RoleKey, cfg: AgentConfig) => void;
}

export const useAppStore = create<AppState>((set) => ({
  agents: {
    boke: defaultAgent('ボケ'),
    tsukkomi: defaultAgent('ツッコミ'),
    director: defaultAgent('ディレクター'),
  },
  setAgent: (role, cfg) => set((s) => ({ agents: { ...s.agents, [role]: cfg } })),
}))

// quick save/load helpers
export function saveSettings() {
  try { localStorage.setItem('three-agent-settings', JSON.stringify((useAppStore.getState().agents))) } catch {}
}
export function loadSettings() {
  try {
    const raw = localStorage.getItem('three-agent-settings')
    if (!raw) return
    const obj = JSON.parse(raw)
    const st = useAppStore.getState()
    Object.entries(obj).forEach(([k,v])=> st.setAgent(k as any, v as any))
  } catch {}
}
