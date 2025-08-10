import { create } from 'zustand'
import type { AgentConfig, RoleKey } from '@/types'

function defaultAgent(name: string): AgentConfig {
  return {
    name,
    provider: 'Ollama',
    model: 'gemma3:4b',                  // ★初期を実IDへ
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

type SavedSetting = {
  id: string;
  name: string;
  timestamp: number;
  agents: Record<RoleKey, AgentConfig>;
}

type AppState = {
  agents: Record<RoleKey, AgentConfig>;
  setAgent: (role: RoleKey, cfg: AgentConfig) => void;
  // 複数設定管理用
  savedSettings: SavedSetting[];
  loadSavedSettings: () => void;
  saveSetting: (name: string) => void;
  loadSetting: (id: string) => void;
  deleteSetting: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  agents: {
    boke: defaultAgent('ボケ'),
    tsukkomi: defaultAgent('ツッコミ'),
    director: defaultAgent('ディレクター'),
  },
  setAgent: (role, cfg) => set((s) => ({ agents: { ...s.agents, [role]: cfg } })),
  
  // 複数設定管理
  savedSettings: [],
  
  loadSavedSettings: () => {
    try {
      const raw = localStorage.getItem('three-agent-saved-settings')
      if (raw) {
        const settings = JSON.parse(raw) as SavedSetting[]
        set({ savedSettings: settings })
      }
    } catch (e) {
      console.error('保存済み設定の読み込みに失敗しました:', e)
    }
  },
  
  saveSetting: (name: string) => {
    const { agents, savedSettings } = get()
    const newSetting: SavedSetting = {
      id: Date.now().toString(),
      name,
      timestamp: Date.now(),
      agents: JSON.parse(JSON.stringify(agents)) // deep copy
    }
    
    const updatedSettings = [...savedSettings, newSetting]
    set({ savedSettings: updatedSettings })
    
    try {
      localStorage.setItem('three-agent-saved-settings', JSON.stringify(updatedSettings))
      console.log(`設定「${name}」を保存しました`)
    } catch (e) {
      console.error('設定の保存に失敗しました:', e)
    }
  },
  
  loadSetting: (id: string) => {
    const { savedSettings } = get()
    const setting = savedSettings.find(s => s.id === id)
    if (setting) {
      set({ agents: setting.agents })
      console.log(`設定「${setting.name}」を読み込みました`)
    }
  },
  
  deleteSetting: (id: string) => {
    const { savedSettings } = get()
    const updatedSettings = savedSettings.filter(s => s.id !== id)
    set({ savedSettings: updatedSettings })
    
    try {
      localStorage.setItem('three-agent-saved-settings', JSON.stringify(updatedSettings))
      console.log('設定を削除しました')
    } catch (e) {
      console.error('設定の削除に失敗しました:', e)
    }
  }
}))

// quick save/load helpers
export function saveSettings() {
  try { 
    localStorage.setItem('three-agent-settings', JSON.stringify(useAppStore.getState().agents))
    console.log('設定を保存しました')
  } catch (e) {
    console.error('設定の保存に失敗しました:', e)
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem('three-agent-settings')
    if (!raw) {
      console.log('保存された設定が見つかりません')
      return false
    }
    const obj = JSON.parse(raw)
    const store = useAppStore.getState()
    
    // 各エージェントの設定を順次更新
    Object.entries(obj).forEach(([role, config]) => {
      if (role === 'boke' || role === 'tsukkomi' || role === 'director') {
        store.setAgent(role as RoleKey, config as AgentConfig)
      }
    })
    
    console.log('設定を読み込みました')
    return true
  } catch (e) {
    console.error('設定の読み込みに失敗しました:', e)
    return false
  }
}
