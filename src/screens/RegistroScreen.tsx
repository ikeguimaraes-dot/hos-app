import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS } from '../lib/types';

const MESES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function formatPeriodo(periodo: string): string {
  if (!periodo) return '—';
  const [ano, mes] = periodo.split('-');
  return `${MESES[mes] || mes} ${ano}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface TimeRecord {
  id: string;
  periodo: string;
  horas_previstas?: string;
  horas_trabalhadas?: string;
  saldo_banco?: string;
  banco_horas_acumulado?: string;
  banco_horas_positivo?: string;
  adicional_noturno?: string;
  ferias_dias?: number;
  afastamentos_dias?: number;
}

interface OvertimeRecord {
  id: string;
  date: string;
  hours?: number;
  type?: string;
  approved?: boolean;
  periodo?: string;
  reason?: string;
}

interface Warning {
  id: string;
  date: string;
  level?: string;
  description?: string;
}

interface TipsRecord {
  id: string;
  periodo: string;
  valor_ponto?: number;
  total_pontos?: number;
  pontos_liquidos?: number;
}

interface TransportVoucher {
  id: string;
  periodo: string;
  dias_uteis?: number;
  valor_diario?: number;
  desconto_funcionario?: number;
  valor_empresa?: number;
}

interface Absence {
  id: string;
  date: string;
  type?: string;
  reason?: string;
  score_impact?: number;
  atestado_path?: string;
}

export default function RegistroScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRecord[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [tips, setTips] = useState<TipsRecord[]>([]);
  const [transport, setTransport] = useState<TransportVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        Alert.alert('Sessão expirada', 'Faça login novamente.', [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
        ]);
        return;
      }
      setEmployeeId(session.employee.id);
    })();
  }, []);

  useEffect(() => {
    if (employeeId) fetchAll();
  }, [employeeId]);

  async function fetchAll() {
    if (!employeeId) return;

    const [timeRes, overtimeRes, absenceRes, warningsRes, tipsRes, transportRes] = await Promise.all([
      supabase
        .from('time_records')
        .select('*')
        .eq('employee_id', employeeId)
        .order('periodo', { ascending: false }),
      supabase
        .from('overtime_records')
        .select('*')
        .eq('employee_id', employeeId)
        .order('date', { ascending: false }),
      supabase
        .from('absences')
        .select('*')
        .eq('employee_id', employeeId)
        .order('date', { ascending: false }),
      supabase
        .from('warnings')
        .select('*')
        .eq('employee_id', employeeId)
        .order('date', { ascending: false }),
      supabase
        .from('tips_records')
        .select('*')
        .eq('employee_id', employeeId)
        .order('periodo', { ascending: false }),
      supabase
        .from('transport_vouchers')
        .select('*')
        .eq('employee_id', employeeId)
        .order('periodo', { ascending: false }),
    ]);

    if (timeRes.error) console.error('[REGISTRO] time_records error:', timeRes.error);
    if (overtimeRes.error) console.error('[REGISTRO] overtime error:', overtimeRes.error);
    if (absenceRes.error) console.error('[REGISTRO] absences error:', absenceRes.error);
    if (warningsRes.error) console.error('[REGISTRO] warnings error:', warningsRes.error);
    if (tipsRes.error) console.error('[REGISTRO] tips error:', tipsRes.error);
    if (transportRes.error) console.error('[REGISTRO] transport error:', transportRes.error);

    setTimeRecords(timeRes.data || []);
    setOvertime(overtimeRes.data || []);
    setAbsences(absenceRes.data || []);
    setWarnings(warningsRes.data || []);
    setTips(tipsRes.data || []);
    setTransport(transportRes.data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [employeeId]);

  type SectionData = { title: string; data: any[]; type: string };

  const sections: SectionData[] = [
    { title: 'Registro de Ponto', data: timeRecords, type: 'time' },
    { title: 'Horas Extras', data: overtime, type: 'overtime' },
    { title: 'Ausências', data: absences, type: 'absence' },
    { title: 'Gorjetas', data: tips, type: 'tips' },
    { title: 'Vale Transporte', data: transport, type: 'transport' },
    { title: 'Advertências', data: warnings, type: 'warning' },
  ];

  function renderTimeCard(item: TimeRecord) {
    const saldoPositivo = item.saldo_banco && !item.saldo_banco.startsWith('-');
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Previstas</Text>
          <Text style={styles.cardValue}>{item.horas_previstas || '—'}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Trabalhadas</Text>
          <Text style={styles.cardValue}>{item.horas_trabalhadas || '—'}</Text>
        </View>

        {item.saldo_banco && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Saldo banco</Text>
            <Text style={[styles.cardValue, { color: saldoPositivo ? COLORS.SUCCESS : COLORS.ERROR }]}>
              {saldoPositivo ? '+' : ''}{item.saldo_banco}
            </Text>
          </View>
        )}

        {item.banco_horas_acumulado && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Banco acumulado</Text>
            <Text style={styles.cardValueSmall}>{item.banco_horas_acumulado}</Text>
          </View>
        )}

        {item.adicional_noturno && item.adicional_noturno !== '00:00' && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Adicional noturno</Text>
            <Text style={styles.cardValueSmall}>{item.adicional_noturno}</Text>
          </View>
        )}

        {(item.ferias_dias != null && item.ferias_dias > 0) || (item.afastamentos_dias != null && item.afastamentos_dias > 0) ? (
          <View style={[styles.cardRow, { marginTop: 4 }]}>
            {item.ferias_dias != null && item.ferias_dias > 0 && (
              <Text style={styles.cardMeta}>Férias: {item.ferias_dias} dias</Text>
            )}
            {item.afastamentos_dias != null && item.afastamentos_dias > 0 && (
              <Text style={styles.cardMeta}>Afastamentos: {item.afastamentos_dias}d</Text>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  function renderOvertimeCard(item: OvertimeRecord) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          <Text style={[styles.badge, item.approved ? styles.badgeApproved : styles.badgePending]}>
            {item.approved ? '● Aprovado' : '● Pendente'}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Tipo: {item.type || '—'}</Text>
          <Text style={[styles.cardValue, { color: COLORS.SUCCESS }]}>
            {item.hours != null ? `${item.hours}h` : '—'}
          </Text>
        </View>
        {item.reason && (
          <Text style={styles.cardMeta}>Motivo: {item.reason}</Text>
        )}
      </View>
    );
  }

  function renderAbsenceCard(item: Absence) {
    const isDanger = item.type?.toLowerCase().includes('injustificad');
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          {item.type && (
            <Text style={[styles.badge, isDanger ? styles.badgeDanger : styles.badgeNeutral]}>
              {item.type}
            </Text>
          )}
        </View>
        {item.reason && (
          <Text style={styles.cardMeta}>Motivo: {item.reason}</Text>
        )}
        {item.score_impact != null && item.score_impact !== 0 && (
          <Text style={[styles.cardMeta, { color: COLORS.ERROR, fontWeight: '600' }]}>
            Impacto no score: {item.score_impact} pts
          </Text>
        )}
      </View>
    );
  }

  function formatCurrency(val?: number | null) {
    if (val == null) return '—';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  }

  function renderTipsCard(item: TipsRecord) {
    const total = (item.pontos_liquidos ?? item.total_pontos ?? 0) * (item.valor_ponto ?? 0);
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
        {item.valor_ponto != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor do ponto</Text>
            <Text style={styles.cardValue}>{formatCurrency(item.valor_ponto)}</Text>
          </View>
        )}
        {item.total_pontos != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Total de pontos</Text>
            <Text style={styles.cardValue}>{item.total_pontos}</Text>
          </View>
        )}
        {item.pontos_liquidos != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Pontos líquidos</Text>
            <Text style={styles.cardValue}>{item.pontos_liquidos}</Text>
          </View>
        )}
        <View style={[styles.cardRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }]}>
          <Text style={styles.cardLabel}>Total gorjeta</Text>
          <Text style={[styles.cardValue, { color: COLORS.SUCCESS }]}>{formatCurrency(total)}</Text>
        </View>
      </View>
    );
  }

  function renderTransportCard(item: TransportVoucher) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
        {item.dias_uteis != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Dias úteis</Text>
            <Text style={styles.cardValue}>{item.dias_uteis}</Text>
          </View>
        )}
        {item.valor_diario != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor diário</Text>
            <Text style={styles.cardValue}>{formatCurrency(item.valor_diario)}</Text>
          </View>
        )}
        {item.desconto_funcionario != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Desconto funcionário</Text>
            <Text style={[styles.cardValue, { color: COLORS.ERROR }]}>{formatCurrency(item.desconto_funcionario)}</Text>
          </View>
        )}
        {item.valor_empresa != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor empresa</Text>
            <Text style={[styles.cardValue, { color: COLORS.SUCCESS }]}>{formatCurrency(item.valor_empresa)}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderWarningCard(item: Warning) {
    const levelColors: Record<string, string> = {
      leve: '#F59E0B',
      moderada: '#F97316',
      grave: '#EF4444',
    };
    const level = item.level?.toLowerCase() || '';
    const color = levelColors[level] || COLORS.TEXT_SECONDARY;
    return (
      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          {item.level && (
            <Text style={[styles.badge, { color, backgroundColor: color + '22' }]}>
              {item.level}
            </Text>
          )}
        </View>
        {item.description && (
          <Text style={styles.cardMeta}>{item.description}</Text>
        )}
      </View>
    );
  }

  function renderItem({ item, section }: { item: any; section: SectionData }) {
    if (section.type === 'time') return renderTimeCard(item);
    if (section.type === 'overtime') return renderOvertimeCard(item);
    if (section.type === 'absence') return renderAbsenceCard(item);
    if (section.type === 'tips') return renderTipsCard(item);
    if (section.type === 'transport') return renderTransportCard(item);
    if (section.type === 'warning') return renderWarningCard(item);
    return renderAbsenceCard(item);
  }

  function renderSectionHeader({ section }: { section: SectionData }) {
    return <Text style={styles.sectionTitle}>{section.title}</Text>;
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  const hasData = timeRecords.length > 0 || overtime.length > 0 || absences.length > 0 || warnings.length > 0 || tips.length > 0 || transport.length > 0;

  if (!hasData) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="time-outline" size={64} color={COLORS.BORDER} />
        <Text style={styles.emptyTitle}>Nenhum registro</Text>
        <Text style={styles.emptySubtitle}>Seus registros de ponto, horas extras e ausências aparecerão aqui.</Text>
      </View>
    );
  }

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.list}
      sections={sections.filter(s => s.data.length > 0)}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginTop: 16,
    marginBottom: 10,
  },
  card: {
    backgroundColor: COLORS.CARD,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardPeriod: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  cardLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  cardValueSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeApproved: {
    color: COLORS.SUCCESS,
    backgroundColor: '#DCFCE7',
  },
  badgePending: {
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  badgeDanger: {
    color: COLORS.ERROR,
    backgroundColor: '#FEE2E2',
  },
  badgeNeutral: {
    color: COLORS.TEXT_SECONDARY,
    backgroundColor: COLORS.BACKGROUND,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});
