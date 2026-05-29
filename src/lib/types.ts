export interface Employee {
  id: string;
  cpf: string;
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
  data_admissao: string;
  empresa: string;
  status: string;
}

export interface AuthSession {
  employee: Employee;
  token: string;
  expiresAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  access_code: string;
  job_opening_id: string;
  status: 'pendente' | 'em_andamento' | 'concluido';
}

export interface InterviewQuestion {
  id: string;
  job_opening_id: string;
  video_path: string;
  ordem: number;
}

export interface InterviewResponse {
  id: string;
  candidate_id: string;
  question_id: string;
  video_url: string;
}

export const COLORS = {
  PRIMARY: '#6366F1',
  BACKGROUND: '#F8FAFC',
  CARD: '#FFFFFF',
  TEXT: '#1E293B',
  TEXT_SECONDARY: '#475569',
  BORDER: '#E2E8F0',
  ERROR: '#EF4444',
  SUCCESS: '#22C55E',
  // Tokens de texto com contraste WCAG AA (ratio ≥ 4.5:1 sobre fundo claro)
  SUCCESS_TEXT: '#166534',  // verde escuro — texto sobre fundo claro (ratio ~7.2:1)
  ERROR_TEXT: '#991B1B',    // vermelho escuro — texto sobre fundo claro (ratio ~7.5:1)
} as const;
