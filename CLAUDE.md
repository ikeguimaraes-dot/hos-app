# HOS App — Documentação Completa do Projeto

> Arquivo de contexto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

---

## 1. O que é o projeto

**HOS** (Human Operations System) é um aplicativo mobile de RH para o **Grupo KPH**.
O app tem dois perfis de usuário completamente separados:

- **Funcionários** — acessam informações de RH: holerites, banco de horas, documentos, férias, campanhas internas, registro de ponto e ranking de pontuação.
- **Candidatos** — realizam entrevistas em vídeo de forma assíncrona diretamente pelo app. O candidato recebe um código de acesso único (`CAND-XXXX`) e responde perguntas em vídeo gravadas previamente pelo RH.

O app é voltado para iOS e Android. O desenvolvimento usa **Expo Go** (sem prebuild/bare workflow).

---

## 2. Stack tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework mobile | React Native | 0.81.5 |
| Runtime JS | Hermes | default |
| Ambiente de desenvolvimento | Expo | ~54.0.33 |
| Linguagem | TypeScript | ~5.9.2 (strict) |
| Banco de dados / Backend | Supabase (PostgreSQL) | @supabase/supabase-js ^2.102.1 |
| Navegação | React Navigation Stack + Bottom Tabs | ^7.x |
| Estilização | StyleSheet nativo + NativeWind/Tailwind | NativeWind ^4.2.3 |
| Ícones | @expo/vector-icons (Ionicons) | incluso no Expo |
| Armazenamento local | AsyncStorage | 2.2.0 |
| Upload de imagens | expo-image-picker | ~17.0.10 |
| Upload de documentos | expo-document-picker | ~14.0.8 |
| Sistema de arquivos | expo-file-system | ~19.0.21 |
| Gravação de vídeo | expo-camera (CameraView) | instalado com SDK 54 |
| Reprodução de vídeo | expo-av (Video) | instalado com SDK 54 |
| WebView | react-native-webview | 13.15.0 |
| Abertura de URLs/PDFs | expo-web-browser + Linking | ~15.0.10 |

**Nova arquitetura** do React Native está ativada (`newArchEnabled: true` no app.json).

---

## 3. Configuração do Supabase

**Arquivo:** `src/lib/supabase.ts`

```
URL:  https://afxsrcezmetipzgosdvb.supabase.co
Role: service_role (chave hardcoded no arquivo)
```

O cliente é configurado com `autoRefreshToken: false`, `persistSession: false`, `detectSessionInUrl: false`.

A autenticação dos funcionários é feita **manualmente via AsyncStorage**, sem usar o sistema de auth do Supabase. O Supabase é usado apenas como banco de dados e storage.

> As credenciais ficam em `.env` (não versionado) E hardcoded em `src/lib/supabase.ts`. O `.env` tem a anon key; o arquivo `.ts` usa a service role key.

---

## 4. Estrutura de arquivos do projeto

```
hos-app/
├── App.tsx                          <- Navegação raiz (Stack + Tabs)
├── index.ts                         <- Entry point Expo
├── app.json                         <- Config Expo (nome: HOS, slug: hos-app)
├── package.json
├── tsconfig.json                    <- strict: true, extends expo/tsconfig.base
├── babel.config.js                  <- preset: expo
├── metro.config.js
├── tailwind.config.js
├── global.css
├── nativewind-env.d.ts
├── CLAUDE.md                        <- Este arquivo (contexto para Claude Code)
│
├── src/
│   ├── lib/
│   │   ├── supabase.ts             <- Cliente Supabase (service role)
│   │   ├── auth.ts                 <- login(), logout(), getSession(), primeiroAcesso()
│   │   └── types.ts                <- Interfaces TypeScript + constante COLORS
│   │
│   └── screens/
│       ├── LoginScreen.tsx          <- Login de funcionário (CPF + senha)
│       ├── PrimeiroAcessoScreen.tsx <- Cadastro de senha no primeiro acesso
│       ├── HomeScreen.tsx           <- Dashboard principal (ranking, resumo, ações rápidas)
│       ├── FinanceiroScreen.tsx     <- Holerites, gorjetas, vale-transporte
│       ├── DocumentosScreen.tsx     <- Upload e visualização de documentos
│       ├── RegistroScreen.tsx       <- Ponto, banco de horas, ausências, advertências
│       ├── FeriasScreen.tsx         <- Período de férias
│       ├── CampanhasScreen.tsx      <- Campanhas internas por departamento/empresa
│       ├── PdfViewerScreen.tsx      <- Visualizador de PDF embutido
│       ├── CandidateLoginScreen.tsx <- Acesso do candidato por código
│       ├── InterviewScreen.tsx      <- Entrevista em vídeo (gravar e enviar respostas)
│       └── InterviewCompleteScreen.tsx <- Tela de conclusão da entrevista
│
└── assets/
    ├── icon.png
    ├── splash-icon.png
    └── adaptive-icon.png
```

> **Ignorar:** As pastas `app 2/`, `app 3/`, `lib 2/`, `lib 3/` e arquivos duplicados são lixo de tentativas antigas e estão no `.gitignore`. O projeto real usa `App.tsx` (raiz) + `src/`.

---

## 5. Navegação (App.tsx)

### Stack Navigator raiz

```
Stack.Navigator
├── Login                  -> LoginScreen
├── PrimeiroAcesso         -> PrimeiroAcessoScreen  (com header)
├── AppTabs                -> AppTabs (Tab Navigator)
├── CandidateLogin         -> CandidateLoginScreen
├── Interview              -> InterviewScreen        (gestureEnabled: false)
└── InterviewComplete      -> InterviewCompleteScreen (gestureEnabled: false)
```

### AppTabs (Bottom Tab Navigator)

```
Tab.Navigator
├── Home        -> HomeScreen
├── Financeiro  -> FinanceiroScreen
├── Documentos  -> DocumentosNavigator (Stack)
│               ├── DocumentosList -> DocumentosScreen
│               └── PdfViewer      -> PdfViewerScreen
├── Registro    -> RegistroScreen
├── Ferias      -> FeriasScreen
└── Campanhas   -> CampanhasScreen
```

### Regras de navegação importantes

- Login com sucesso: `navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] })`
- Logout: `navigation.reset({ index: 0, routes: [{ name: 'Login' }] })`
- Conclusão de entrevista: `navigation.reset({ index: 0, routes: [{ name: 'Login' }] })`
- `gestureEnabled: false` nas telas de entrevista para evitar saída acidental durante gravação.
- Candidatos **nunca** chegam ao `AppTabs`. Fluxo: `Login → CandidateLogin → Interview → InterviewComplete → Login`.

---

## 6. Sistema de autenticação dos funcionários

**Arquivo:** `src/lib/auth.ts` | **Chave AsyncStorage:** `@hos_session`

### login(cpf, password)
1. Busca `employee_auth` por CPF
2. Compara `password_hash === password` (plaintext — dívida técnica)
3. Busca `employees` pelo `employee_id`
4. Cria `AuthSession` com expiração de 7 dias e salva no AsyncStorage
5. Retorna objeto `Employee`

### primeiroAcesso(cpf, password)
1. Verifica se CPF existe em `employees`
2. Verifica se já existe `employee_auth` para aquele CPF
3. Insere `{ cpf, password_hash: password }` em `employee_auth`

### getSession()
Lê AsyncStorage → verifica expiração → retorna `AuthSession | null`. Se expirada, chama `logout()`.

---

## 7. Sistema de entrevista de candidatos

### Fluxo completo

```
CandidateLoginScreen
  -> digita access_code (ex: CAND-AB3X, auto-uppercase)
  -> busca candidates WHERE access_code = código
  -> se status = 'concluido': bloqueia com mensagem
  -> se encontrou (pendente/em_andamento): navega para Interview com objeto candidate

InterviewScreen
  -> atualiza candidates.status = 'em_andamento'
  -> busca interview_questions WHERE job_opening_id = candidate.job_opening_id ORDER BY ordem
  -> busca interview_responses WHERE candidate_id = candidate.id
  -> calcula primeira pergunta sem resposta (retomada automática se app fechar)
  -> para cada pergunta:
      - gera signed URL do vídeo (bucket interview-videos, TTL 3600s)
      - exibe vídeo com expo-av (auto-play, sem controles nativos)
      - botão "Assistir novamente": setPositionAsync(0) + playAsync()
      - botão "Iniciar gravação":
          - solicita permissões câmera + microfone
          - monta CameraView (facing=front, mode=video)
          - onCameraReady -> recordAsync({ maxDuration: 180 })
          - timer MM:SS + ponto vermelho piscando
          - botão "Parar gravação" -> stopRecording()
          - após parar: preview + botões "Regravar" e "Enviar resposta"
      - ao enviar:
          - fetch(uri) -> blob -> supabase.storage.upload
          - path: candidates/{candidate_id}/{question_id}.mp4
          - insert interview_responses: { candidate_id, question_id, video_url }
          - avança pergunta OU navega para InterviewComplete

InterviewCompleteScreen
  -> atualiza candidates.status = 'concluido'
  -> botão "Sair" -> navigation.reset para Login
```

### Estados da gravação

| Estado | UI |
|---|---|
| `idle` | Botão "Iniciar gravação" com ícone câmera |
| `camera_open` | CameraView + spinner "Preparando câmera..." |
| `recording` | CameraView + timer + botão "Parar gravação" vermelho |
| `recorded` | Preview do vídeo + botões "Regravar" e "Enviar resposta" |
| `uploading` | ActivityIndicator + "Enviando..." |

---

## 8. Banco de dados (Supabase / PostgreSQL)

### Tabelas de funcionários

#### `employees`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `full_name` | text | Nome completo |
| `cpf` | text | CPF sem formatação |
| `department` | text | Departamento |
| `role` | text | Cargo |
| `score` | integer | Pontuação para ranking |
| `photo_url` | text | URL pública (bucket `avatars`) |
| `email` | text | |
| `empresa` | text | Empresa do grupo |
| `status` | text | |
| `data_admissao` | text | |

#### `employee_auth`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `cpf` | text | |
| `password_hash` | text | Senha em plaintext (dívida técnica) |
| `employee_id` | uuid FK | -> employees.id |

#### `payslips`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `periodo` | text | YYYY-MM |
| `salary_base` | numeric | |
| `total_vencimentos` | numeric | |
| `total_descontos` | numeric | |
| `valor_liquido` | numeric | |
| `fgts_mes` | numeric | |
| `inss_base` | numeric | |
| `irrf_base` | numeric | |
| `faixa_irrf` | text | |
| `pdf_path` | text | Path no storage (bucket `holerites` ou `payslips`) |

#### `tips_records`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `periodo` | text | YYYY-MM |
| `valor` | numeric | Valor gorjeta (FinanceiroScreen) |
| `valor_ponto` | numeric | Valor por ponto (RegistroScreen) |
| `total_pontos` | integer | |
| `pontos_liquidos` | integer | |

#### `transport_vouchers`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `periodo` | text | YYYY-MM |
| `valor` | numeric | Valor total (FinanceiroScreen) |
| `quantidade` | integer | Dias (FinanceiroScreen) |
| `dias_uteis` | integer | (RegistroScreen) |
| `valor_diario` | numeric | |
| `desconto_funcionario` | numeric | |
| `valor_empresa` | numeric | |

#### `time_records`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `periodo` | text | YYYY-MM |
| `horas_previstas` | text | Ex: "176:00" |
| `horas_trabalhadas` | text | Ex: "182:30" |
| `saldo_banco` | text | Ex: "+06:30" ou "-02:00" |
| `banco_horas_acumulado` | text | |
| `adicional_noturno` | text | |
| `ferias_dias` | integer | |
| `afastamentos_dias` | integer | |

#### `overtime_records`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `date` | date | |
| `hours` | numeric | |
| `type` | text | |
| `approved` | boolean | |
| `reason` | text | |

#### `absences`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `date` | date | |
| `type` | text | Ex: "Injustificada", "Atestado" |
| `reason` | text | |
| `score_impact` | integer | Impacto negativo no score |
| `atestado_path` | text | |

#### `warnings`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `date` | date | |
| `level` | text | `leve`, `moderada`, `grave` |
| `description` | text | |

#### `documents`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK | |
| `name` | text | Nome do arquivo |
| `type` | text | `contrato`, `holerite`, `ferias`, `admissao`, `outro` |
| `storage_path` | text | Path no bucket `documents` |
| `uploaded_at` | timestamptz | |

#### `campaigns`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `description` | text | |
| `image_url` | text | |
| `category` | text | `saude`, `evento`, `comunicado` |
| `target` | text | `all`, `department`, `company` |
| `target_value` | text | Nome do depto/empresa |
| `starts_at` | date | |
| `ends_at` | date | |
| `active` | boolean | |
| `created_at` | timestamptz | |

---

### Tabelas de entrevista de candidatos

#### `job_openings`
Vagas de emprego. Estrutura completa não mapeada no app ainda.

#### `candidates`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Nome do candidato |
| `access_code` | text | Código único ex: `CAND-AB3X` |
| `job_opening_id` | uuid FK | -> job_openings.id |
| `status` | text | `pendente`, `em_andamento`, `concluido` |

#### `interview_questions`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `job_opening_id` | uuid FK | -> job_openings.id |
| `video_path` | text | Path no bucket `interview-videos` |
| `ordem` | integer | Ordem de exibição (ASC) |

#### `interview_responses`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `candidate_id` | uuid FK | -> candidates.id |
| `question_id` | uuid FK | -> interview_questions.id |
| `video_url` | text | Path: `candidates/{candidate_id}/{question_id}.mp4` |

---

## 9. Storage Buckets (Supabase Storage)

| Bucket | Uso | Acesso |
|---|---|---|
| `avatars` | Fotos de perfil dos funcionários | Público (URL direta) |
| `documents` | Documentos enviados pelos funcionários | Signed URL (TTL 3600s) |
| `holerites` / `payslips` | PDFs de holerites | Signed URL (TTL 3600s) |
| `interview-videos` | Vídeos das perguntas E respostas dos candidatos | Signed URL (TTL 3600s) |

### Paths no storage
- Foto de perfil: `avatars/{employee_id}.jpg`
- Documento de funcionário: `documents/{employee_id}/{timestamp}_{filename}`
- Vídeo de pergunta: path armazenado em `interview_questions.video_path`
- Vídeo de resposta: `candidates/{candidate_id}/{question_id}.mp4`

---

## 10. Tipos TypeScript globais (src/lib/types.ts)

```typescript
interface Employee {
  id: string; cpf: string; nome: string; email: string;
  cargo: string; departamento: string; data_admissao: string;
  empresa: string; status: string;
}

interface AuthSession {
  employee: Employee;
  token: string;      // sempre 'local'
  expiresAt: string;  // ISO string, 7 dias
}

interface Candidate {
  id: string; name: string; access_code: string;
  job_opening_id: string;
  status: 'pendente' | 'em_andamento' | 'concluido';
}

interface InterviewQuestion {
  id: string; job_opening_id: string;
  video_path: string; ordem: number;
}

interface InterviewResponse {
  id: string; candidate_id: string;
  question_id: string; video_url: string;
}

const COLORS = {
  PRIMARY: '#6366F1', BACKGROUND: '#F8FAFC', CARD: '#FFFFFF',
  TEXT: '#1E293B', TEXT_SECONDARY: '#64748B', BORDER: '#E2E8F0',
  ERROR: '#EF4444', SUCCESS: '#22C55E',
}
```

---

## 11. Detalhes de cada tela

### LoginScreen
- CPF formatado automaticamente (000.000.000-00)
- Botão "Entrar" -> `login()` -> reset para AppTabs
- Link "Primeiro acesso" -> PrimeiroAcesso
- Separador "ou" + botão "Sou candidato" -> CandidateLogin

### PrimeiroAcessoScreen
- CPF formatado, senha + confirmação, mínimo 6 caracteres
- Chama `primeiroAcesso()`

### HomeScreen
- 5 queries em paralelo: score/photo, último holerite, banco de horas, faltas do mês, ranking top 3
- Pódio: exibe 2º, 1º, 3º (formato pódio com alturas diferentes)
- 4 cards de resumo: Último Holerite, Banco de Horas, Faltas no Mês, Score
- Ações rápidas: Financeiro, Documentos, Registro, Férias
- Foto de perfil clicável: ActionSheet (iOS) / Alert (Android) para câmera/galeria
- Upload foto: base64 -> Uint8Array -> bucket `avatars`
- Botão de logout no canto superior direito

### FinanceiroScreen
- SectionList: Holerites, Gorjetas, Vale Transporte
- Holerites com salário, vencimentos, descontos, líquido, FGTS, INSS, IRRF
- Botão "Ver PDF" -> signed URL -> Linking.openURL (tenta bucket `holerites` depois `payslips`)

### DocumentosScreen
- FlatList de documentos + botão "+ Enviar Documento"
- Bottom sheet modal: câmera ou PDF
- Upload: base64 -> Uint8Array -> bucket `documents`
- Visualização: signed URL -> Linking.openURL

### RegistroScreen
- SectionList: Registro de Ponto, Horas Extras, Ausências, Gorjetas, VT, Advertências
- Advertências com borda colorida por nível (leve=amarelo, moderada=laranja, grave=vermelho)
- Horas extras com badge Aprovado/Pendente

### FeriasScreen
- FlatList filtrando `time_records` onde `ferias_dias > 0`

### CampanhasScreen
- FlatList de campanhas ativas filtradas por `target` (all/department/company)
- Tap abre Modal com detalhes e imagem completa
- Categorias: saude (verde), evento (indigo), comunicado (amarelo)

### PdfViewerScreen
- WebView com a URL do PDF passada via `route.params`

### CandidateLoginScreen
- Input com `autoCapitalize="characters"` + `toUpperCase()` no onChangeText
- Query candidates por access_code
- Bloqueia se status = 'concluido'

### InterviewScreen
- Layout fixo (sem scroll): progress header + vídeo pergunta (~27% da tela) + área gravação
- Camera frontal, modo vídeo, máximo 3 minutos
- Upload via `fetch(uri) -> response.blob()` (mais eficiente para vídeos grandes)
- Retomada automática: primeiro question_id não presente em interview_responses

### InterviewCompleteScreen
- Atualiza status no useEffect
- Ícone check verde (96px)
- Botão "Sair" -> navigation.reset para Login

---

## 12. Padrões e convenções

### Navegação
- Sempre `navigation.reset()` em transições de auth (evita botão "voltar" para login)
- Props tipadas como `any` (padrão do projeto)
- `navigation.replace()` para telas que não devem ter botão de voltar

### Queries Supabase
- `PGRST116` = row not found em `.single()` — não é erro crítico em alguns contextos
- `.limit(1).single()` para o último registro de uma série

### Upload de arquivos
- **Imagens (pequenas):** base64 -> Uint8Array -> supabase.storage.upload
- **Vídeos (grandes):** `fetch(uri) -> blob` -> supabase.storage.upload (evita OOM)
- Sempre `upsert: true`

### Estilização
- Sempre `StyleSheet.create()` no final do arquivo
- NativeWind existe mas não está sendo usado nas telas de `src/` — usar StyleSheet nativo
- `COLORS` sempre importado de `src/lib/types.ts`

---

## 13. Dívidas técnicas

1. **Senhas em plaintext** — `employee_auth.password_hash` sem criptografia
2. **Service role key exposta** — hardcoded em `src/lib/supabase.ts` (deveria usar anon key + RLS)
3. **Console.logs de debug** — em `auth.ts` e várias telas, remover antes de publicar
4. **`expo-file-system/legacy`** — DocumentosScreen e HomeScreen usam a API legada
5. **Sem tipagem nas params de navegação** — todos `navigation`/`route` são `any`
6. **Sem upsert em `interview_responses`** — pode falhar com constraint violation no retry

---

## 14. Como rodar

```bash
npm install
npm start          # Expo Go via QR code
npm run ios        # Simulador iOS
npm run android    # Emulador Android
```

Não precisa de build nativo. Funciona direto no **Expo Go**.

---

## 15. Histórico do que foi construído

### Módulo de funcionários
Login por CPF, primeiro acesso, dashboard com ranking, holerites com PDF, gorjetas, vale-transporte, upload de documentos, registro de ponto + horas extras + ausências + advertências, férias, campanhas internas, foto de perfil, sessão local 7 dias.

### Módulo de entrevista de candidatos (adicionado em abril/2026)
Acesso por código único, entrevista assíncrona em vídeo, retomada automática, upload para Supabase Storage, conclusão com atualização de status. Isolado completamente do fluxo de funcionários.
