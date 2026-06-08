import AsyncStorage from '@react-native-async-storage/async-storage';
import bcrypt from 'bcryptjs';
import { supabase } from './supabase';
import { AuthSession, Employee } from './types';

const SESSION_KEY = '@hos_session';
const EXPECTED_SUPABASE_REF = process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)\./)?.[1];

export async function login(cpf: string, password: string): Promise<Employee> {
  // Step 1 — Buscar registro em employee_auth via RPC (contorna RLS com ANON key)
  const { data: authRecord, error: authError } = await supabase.rpc('get_auth_by_cpf', { p_cpf: cpf });

  if (authError || !authRecord) {
    throw new Error('CPF não cadastrado. Use o Primeiro Acesso.');
  }

  // Step 2 — Verificar senha com bcrypt
  const senhaCorreta = await bcrypt.compare(password, authRecord.password_hash);
  if (!senhaCorreta) {
    throw new Error('Senha incorreta.');
  }

  // Step 3 — Buscar dados do funcionário via RPC
  const { data: emp, error: empError } = await supabase.rpc('get_employee_profile', {
    p_employee_id: authRecord.employee_id,
  });

  if (empError || !emp) {
    throw new Error('Funcionário não encontrado na base. Fale com o RH.');
  }

  // Step 4 — Montar sessão e salvar
  const employee: Employee = {
    id: emp.id,
    cpf: emp.cpf || cpf,
    nome: emp.nome + (emp.sobrenome ? ' ' + emp.sobrenome : ''),
    email: emp.email || '',
    cargo: emp.funcao || '',
    departamento: emp.departamento || '',
    data_admissao: emp.data_admissao || '',
    status: emp.ativo ? 'ativo' : 'inativo',
    unit_id: emp.unit_id || '',
  };

  const session: AuthSession = {
    employee,
    token: 'local',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    supabaseRef: EXPECTED_SUPABASE_REF,
  };

  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return employee;
}

export async function getSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  const session: AuthSession = JSON.parse(raw);

  // Invalida sessão se banco mudou (migração) ou se expirou
  if (session.supabaseRef && EXPECTED_SUPABASE_REF && session.supabaseRef !== EXPECTED_SUPABASE_REF) {
    await logout();
    return null;
  }

  if (new Date(session.expiresAt) < new Date()) {
    await logout();
    return null;
  }

  return session;
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function primeiroAcesso(cpf: string, password: string): Promise<void> {
  // Steps 1+2 — Verificar CPF e se já tem auth em uma chamada RPC
  const { data: check, error: checkError } = await supabase.rpc('check_primo_acesso', { p_cpf: cpf });

  if (checkError || !check) {
    throw new Error('CPF não encontrado no sistema. Fale com o RH.');
  }

  if (check.has_auth) {
    throw new Error('Este CPF já possui acesso. Use a tela de login.');
  }

  // Step 3 — Criar registro em employee_auth via RPC
  const hashedPassword = await bcrypt.hash(password, 10);
  const { error: insertError } = await supabase.rpc('create_employee_auth', {
    p_employee_id:   check.employee_id,
    p_cpf:           cpf,
    p_password_hash: hashedPassword,
  });

  if (insertError) {
    throw new Error('Erro ao criar acesso: ' + insertError.message);
  }
}
