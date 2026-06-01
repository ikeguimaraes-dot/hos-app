export interface Employee {
  id: string;
  cpf: string;
  nome: string;
  email: string;
  cargo: string;
  departamento: string;
  data_admissao: string;
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

// Design System KPH — HOS App
export const COLORS = {
  // Paleta KPH
  PRIMARY: '#C4622D',       // HOS Brasa — CTA principal, tabs ativos, botões primários
  BACKGROUND: '#F8FAFC',
  CARD: '#FFFFFF',
  TEXT: '#1A1A1A',          // HOS Carvão — texto principal
  TEXT_SECONDARY: '#475569',
  BORDER: '#E2E8F0',
  ERROR: '#EF4444',
  SUCCESS: '#22C55E',
  // Tokens semânticos com contraste WCAG AA (ratio ≥ 4.5:1 sobre fundo claro)
  SUCCESS_TEXT: '#166534',  // verde escuro (ratio ~7.2:1)
  ERROR_TEXT: '#991B1B',    // vermelho escuro (ratio ~7.5:1)
  // Tokens KPH adicionais
  CARVAO: '#1A1A1A',        // HOS Carvão — fundos escuros, splash
  CREME: '#F5F0E8',         // HOS Creme — texto sobre fundo escuro
  PEDRA: '#8A8278',         // HOS Pedra — elementos secundários
  OURO: '#B8975A',          // HOS Ouro — destaques premium
} as const;

// Tipografia KPH — carregada via useFonts em App.tsx
export const FONTS = {
  DISPLAY: 'Fraunces_700Bold',
  DISPLAY_ITALIC: 'Fraunces_700Bold_Italic',
  BODY: 'InstrumentSans_400Regular',
  BODY_MEDIUM: 'InstrumentSans_500Medium',
  BODY_SEMIBOLD: 'InstrumentSans_600SemiBold',
} as const;
