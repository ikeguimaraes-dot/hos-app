import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { AuthSession, Employee } from './types';

const SESSION_KEY = '@hos_session';

export async function login(cpf: string, password: string): Promise<Employee> {
  // Step 1 — Buscar registro em employee_auth
  const { data: authRecord, error: authError } = await supabase
    .from('employee_auth')
    .select('id, cpf, password_hash, employee_id')
    .eq('cpf', cpf)
    .single();

  if (authError || !authRecord) {
    throw new Error('CPF não cadastrado. Use o Primeiro Acesso.');
  }

  // Step 2 — Verificar senha
  // TODO: migrar para Supabase Auth nativo com bcrypt — senha em plaintext é dívida técnica P0 de segurança
  if (authRecord.password_hash !== password) {
    throw new Error('Senha incorreta.');
  }

  // Step 3 — Buscar dados do funcionário em employees pelo employee_id
  const { data: emp, error: empError } = await supabase
    .from('employees')
    .select('id, full_name, cpf, department, role, email, hire_date, status, photo_url')
    .eq('id', authRecord.employee_id)
    .single();

  if (empError || !emp) {
    throw new Error('Funcionário não encontrado na base. Fale com o RH.');
  }

  // Step 4 — Montar sessão e salvar
  const employee: Employee = {
    id: emp.id,
    cpf: emp.cpf || cpf,
    nome: emp.full_name,
    email: emp.email || '',
    cargo: emp.role || '',
    departamento: emp.department || '',
    data_admissao: emp.hire_date || '',
    status: emp.status || '',
  };

  const session: AuthSession = {
    employee,
    token: 'local',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return employee;
}

export async function getSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  const session: AuthSession = JSON.parse(raw);
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
  // Step 1 — Verificar se o CPF existe na tabela employees
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('cpf', cpf)
    .single();

  if (empError || !employee) {
    throw new Error('CPF não encontrado no sistema. Fale com o RH.');
  }

  // Step 2 — Verificar se já tem registro em employee_auth
  const { data: existingAuth } = await supabase
    .from('employee_auth')
    .select('id')
    .eq('cpf', cpf)
    .single();

  if (existingAuth) {
    throw new Error('Este CPF já possui acesso. Use a tela de login.');
  }

  // Step 3 — Criar registro em employee_auth com employee_id FK
  const { error: insertError } = await supabase
    .from('employee_auth')
    .insert({ cpf, password_hash: password, employee_id: employee.id });

  if (insertError) {
    throw new Error('Erro ao criar acesso: ' + insertError.message);
  }
}
