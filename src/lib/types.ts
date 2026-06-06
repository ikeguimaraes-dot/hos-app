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
  supabaseRef?: string;
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

// ─── Design System KPH — HOS App ─────────────────────────────────────────────

export const COLORS = {
  // ── Superfícies ────────────────────────────────────────────────────────────
  background:       '#F5F4F2',   // fundo geral — off-white quente
  surface:          '#FFFFFF',   // cards, modais, inputs
  surfaceSecondary: '#EFEDE9',   // fundo de itens dentro de cards

  // ── Bordas ────────────────────────────────────────────────────────────────
  border: '#E5E2DC',

  // ── Marca ─────────────────────────────────────────────────────────────────
  primary:      '#C4622D',   // HOS Brasa
  primaryLight: '#F0DDD3',   // hover / fundo leve de CTA
  primaryDark:  '#9E4A1F',   // pressed state

  // ── Texto ─────────────────────────────────────────────────────────────────
  textPrimary:   '#1A1A1A',
  textSecondary: '#6B6B6B',
  textTertiary:  '#9E9E9E',
  textInverse:   '#FFFFFF',

  // ── Feedback ──────────────────────────────────────────────────────────────
  success:      '#2D9E6B',
  successLight: '#D4F0E4',
  warning:      '#E8A020',
  warningLight: '#FDF0D4',
  error:        '#D94040',
  errorLight:   '#FAD9D9',
  info:         '#2D7DD2',
  infoLight:    '#D4E8FA',

  // ── Neutros ───────────────────────────────────────────────────────────────
  white:    '#FFFFFF',
  black:    '#1A1A1A',
  gray100:  '#F5F4F2',
  gray200:  '#EFEDE9',
  gray300:  '#E5E2DC',
  gray400:  '#C4BFB8',
  gray500:  '#9E9E9E',
  gray600:  '#6B6B6B',
  gray700:  '#3D3D3D',

  // ── Aliases legados (compatibilidade com telas não redesenhadas) ───────────
  PRIMARY:        '#C4622D',
  BACKGROUND:     '#F5F4F2',
  CARD:           '#FFFFFF',
  TEXT:           '#1A1A1A',
  TEXT_SECONDARY: '#6B6B6B',
  BORDER:         '#E5E2DC',
  ERROR:          '#D94040',
  SUCCESS:        '#2D9E6B',
  SUCCESS_TEXT:   '#166534',
  ERROR_TEXT:     '#991B1B',
  CARVAO:         '#1A1A1A',
  CREME:          '#F0DDD3',
  PEDRA:          '#8A8278',
  OURO:           '#B8975A',
} as const;

// ─── Tipografia ───────────────────────────────────────────────────────────────

export const FONTS = {
  regular:  { fontWeight: '400' as const },
  medium:   { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold:     { fontWeight: '700' as const },
  // Aliases para nomes de família (carregados via useFonts em App.tsx)
  DISPLAY:        'Fraunces_700Bold',
  DISPLAY_ITALIC: 'Fraunces_700Bold_Italic',
  BODY:           'InstrumentSans_400Regular',
  BODY_MEDIUM:    'InstrumentSans_500Medium',
  BODY_SEMIBOLD:  'InstrumentSans_600SemiBold',
} as const;

// ─── Raios de borda ───────────────────────────────────────────────────────────

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
} as const;

// ─── Sombras ──────────────────────────────────────────────────────────────────

export const SHADOW = {
  sm: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
