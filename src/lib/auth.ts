import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { AuthSession, Employee } from './types';

const SESSION_KEY = '@hos_session';
const EXPECTED_SUPABASE_REF = process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)\./)?.[1];

export async function login(cpf: string, password: string): Promise<Employee> {
  const { data, error } = await supabase.rpc('employee_session_login', {
    p_identifier: cpf.replace(/\D/g, ''), p_pin: password,
  });
  if (error || !data?.ok) throw new Error(data?.error || 'Não foi possível entrar. Tente novamente.');
  const emp = data.employee;
  const employee: Employee = {
    id: emp.id, cpf: emp.cpf || cpf,
    nome: [emp.nome, emp.sobrenome].filter(Boolean).join(' '),
    email: emp.email || '', cargo: emp.funcao || '', departamento: emp.departamento || '',
    data_admissao: emp.data_admissao || '', status: emp.ativo ? 'ativo' : 'inativo',
    unit_id: emp.unit_id || '',
  };
  const session: AuthSession = {
    employee, token: data.token, expiresAt: data.expires_at, supabaseRef: EXPECTED_SUPABASE_REF,
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return employee;
}

export async function getSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let session: AuthSession;
  try { session = JSON.parse(raw); } catch { await AsyncStorage.removeItem(SESSION_KEY); return null; }
  if (!/^[a-f0-9]{64}$/.test(session.token || '') || !session.employee?.id ||
      session.supabaseRef !== EXPECTED_SUPABASE_REF ||
      !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
  const { data, error } = await supabase.rpc('employee_session_check');
  if (error || data?.employee_id !== session.employee.id) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

export async function logout(): Promise<void> {
  try { await supabase.rpc('employee_session_logout'); }
  finally { await AsyncStorage.removeItem(SESSION_KEY); }
}

export async function primeiroAcesso(cpf: string, password: string, invite: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(invite.trim())) throw new Error('Solicite ao RH o convite de primeiro acesso.');
  const { data, error } = await supabase.rpc('employee_enrollment_redeem', {
    p_identifier: cpf.replace(/\D/g, ''), p_pin: password, p_invite: invite.trim(),
  });
  if (error || !data?.ok) throw new Error(data?.error || 'Não foi possível ativar seu acesso. Fale com o RH.');
}
