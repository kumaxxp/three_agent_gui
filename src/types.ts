export const PROVIDERS = ['Ollama','LM Studio','vLLM','OpenAI互換URL'] as const;
export const FAILOVER = ['OFF','SOFT','HARD'] as const;

export type Provider = typeof PROVIDERS[number];
export type Failover = typeof FAILOVER[number];
export type RoleKey = 'boke' | 'tsukkomi' | 'director';

export interface AgentConfig {
  name: string;
  provider: Provider;
  model: string;
  endpoint?: string;
  apiKey?: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  repetition_penalty: number;
  failover: Failover;
  timeout_s: number;
  min_tps: number;
  rtt?: number;
  tps?: number;
  promptSystem: string;
  promptStyle: string;
}
