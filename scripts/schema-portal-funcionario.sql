-- ============================================
-- 1. EXPANDIR payslips
-- ============================================
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id);
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS salario_base numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS horas_trabalhadas numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS horas_extras numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adicional_noturno numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gorjeta numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adiantamento numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS vt numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS vr numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS inss numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS fgts numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS outros_descontos numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS valor_liquido numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ============================================
-- 2. FÉRIAS
-- ============================================
CREATE TABLE IF NOT EXISTS vacations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id),
  employee_id uuid REFERENCES employees(id),
  periodo_aquisitivo_inicio date NOT NULL,
  periodo_aquisitivo_fim date NOT NULL,
  inicio_gozo date,
  fim_gozo date,
  dias_direito integer DEFAULT 30,
  dias_gozados integer DEFAULT 0,
  dias_vendidos integer DEFAULT 0,
  abono_pecuniario numeric DEFAULT 0,
  status text DEFAULT 'pendente',
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- 3. PESQUISA DE CLIMA
-- ============================================
CREATE TABLE IF NOT EXISTS climate_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id),
  titulo text NOT NULL,
  descricao text,
  status text DEFAULT 'rascunho',
  data_inicio date,
  data_fim date,
  anonimo boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS climate_survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid REFERENCES climate_surveys(id) ON DELETE CASCADE,
  ordem integer,
  pergunta text NOT NULL,
  tipo text DEFAULT 'escala',
  opcoes jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS climate_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid REFERENCES climate_surveys(id),
  question_id uuid REFERENCES climate_survey_questions(id),
  employee_id uuid,
  resposta text,
  nota integer,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- 4. TREINAMENTOS
-- ============================================
CREATE TABLE IF NOT EXISTS trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id),
  titulo text NOT NULL,
  descricao text,
  tipo text DEFAULT 'interno',
  carga_horaria numeric,
  data_inicio date,
  data_fim date,
  instrutor text,
  status text DEFAULT 'agendado',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid REFERENCES trainings(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id),
  status text DEFAULT 'inscrito',
  nota numeric,
  certificado_url text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- 5. PLANO DE AÇÃO
-- ============================================
CREATE TABLE IF NOT EXISTS action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES units(id),
  employee_id uuid REFERENCES employees(id),
  titulo text NOT NULL,
  descricao text,
  origem text,
  origem_id uuid,
  status text DEFAULT 'aberto',
  prazo date,
  responsavel_id uuid REFERENCES employees(id),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES action_plans(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  responsavel_id uuid,
  prazo date,
  status text DEFAULT 'pendente',
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- 6. RLS — habilitar em todas as novas tabelas
-- ============================================
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE climate_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE climate_survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE climate_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plan_tasks ENABLE ROW LEVEL SECURITY;
