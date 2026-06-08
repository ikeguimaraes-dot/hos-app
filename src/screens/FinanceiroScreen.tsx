import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

const MESES_FULL: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function formatCompetencia(value: string | null | undefined): string {
  if (!value) return '—';
  const [ano, mes] = value.split('-');
  return `${MESES_FULL[mes] || mes} ${ano}`;
}

function formatMesAno(mes: number, ano: number): string {
  const m = String(mes).padStart(2, '0');
  return `${MESES_FULL[m] || m} ${ano}`;
}

function formatCurrency(value?: number | null): string {
  if (value == null) return '—';
  return `R$ ${Math.abs(value).toFixed(2).replace('.', ',')}`;
}

function formatSaldo(value?: number | null): string {
  if (value == null) return '—';
  const sinal = value >= 0 ? '+' : '-';
  return `${sinal}${Math.abs(value).toFixed(0)}h`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Payslip {
  id: string;
  competencia: string;
  nome?: string;
  cargo?: string;
  salario_base?: number;
  horas_trabalhadas?: number;
  horas_extras?: number;
  adicional_noturno?: number;
  gorjeta?: number;
  adiantamento?: number;
  vt?: number;
  vr?: number;
  inss?: number;
  fgts?: number;
  outros_descontos?: number;
  valor_liquido?: number;
  observacoes?: string;
  pdf_path?: string;
}

interface Gorjeta {
  id: string;
  ano: number;
  mes: number;
  valor_bruto?: number;
  valor_liquido?: number;
  pontuacao?: number;
  dias_trabalhados?: number;
  percentual?: number;
  recibo_url?: string;
}

interface Adiantamento {
  id: string;
  competencia: string;
  pgto_15?: number;
  pgto_30?: number;
  valor_bruto?: number;
  valor_liquido?: number;
  gorjeta_1q?: number;
  gorjeta_2q?: number;
}

interface HourBank {
  id: string;
  competencia: string;
  horas_extras?: number;
  horas_debito?: number;
  saldo?: number;
}

type TabKey = 'holerites' | 'gorjeta' | 'adiantamentos' | 'banco';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'holerites',    label: 'Holerites',    icon: 'document-text-outline' },
  { key: 'gorjeta',      label: 'Gorjeta',       icon: 'cash-outline' },
  { key: 'adiantamentos',label: 'Adiantamentos', icon: 'card-outline' },
  { key: 'banco',        label: 'Banco de Horas',icon: 'time-outline' },
];

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function FinanceiroScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('holerites');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [gorjetas, setGorjetas] = useState<Gorjeta[]>([]);
  const [adiantamentos, setAdiantamentos] = useState<Adiantamento[]>([]);
  const [hourBank, setHourBank] = useState<HourBank[]>([]);

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
    if (employeeId) fetchAll(employeeId);
  }, [employeeId]);

  async function fetchAll(id: string) {
    const [payslipRes, gorjetaRes, adiantRes, horasRes] = await Promise.allSettled([
      supabase.rpc('get_my_payslips', { p_employee_id: id }),
      supabase.rpc('get_my_gorjetas', { p_employee_id: id }),
      supabase.rpc('get_my_payments', { p_employee_id: id }),
      supabase.rpc('get_my_hour_bank', { p_employee_id: id }),
    ]);

    if (payslipRes.status === 'fulfilled') setPayslips(payslipRes.value.data || []);
    if (gorjetaRes.status === 'fulfilled') setGorjetas(gorjetaRes.value.data || []);
    if (adiantRes.status === 'fulfilled') setAdiantamentos(adiantRes.value.data || []);
    if (horasRes.status === 'fulfilled') setHourBank(horasRes.value.data || []);

    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    if (!employeeId) return;
    setRefreshing(true);
    await fetchAll(employeeId);
    setRefreshing(false);
  }, [employeeId]);

  // ─── PDF export ─────────────────────────────────────────────────────────────

  async function handleExportarPDF(item: Payslip) {
    const html = `
      <html><head><meta charset="utf-8"/>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#1A1A1A}
        h1{font-size:22px;margin-bottom:4px}
        h2{font-size:15px;color:#6B6B6B;margin-bottom:24px;font-weight:normal}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        td{padding:8px 12px;border-bottom:1px solid #E5E2DC;font-size:14px}
        td:last-child{text-align:right;font-weight:600}
        .sec{background:#F5F4F2;font-weight:700;font-size:12px;color:#6B6B6B;letter-spacing:.5px}
        .liq td{font-size:16px;font-weight:800;color:#C4622D;border-top:2px solid #C4622D}
        .foot{margin-top:40px;font-size:11px;color:#9E9E9E;text-align:center}
      </style></head><body>
      <h1>Holerite — ${formatCompetencia(item.competencia)}</h1>
      <h2>${item.nome || ''} · ${item.cargo || ''}</h2>
      <table>
        <tr class="sec"><td colspan="2">VENCIMENTOS</td></tr>
        ${item.salario_base != null ? `<tr><td>Salário Base</td><td>${formatCurrency(item.salario_base)}</td></tr>` : ''}
        ${item.horas_extras != null ? `<tr><td>Horas Extras</td><td>${formatCurrency(item.horas_extras)}</td></tr>` : ''}
        ${item.adicional_noturno != null ? `<tr><td>Adicional Noturno</td><td>${formatCurrency(item.adicional_noturno)}</td></tr>` : ''}
        ${item.gorjeta != null ? `<tr><td>Gorjeta</td><td>${formatCurrency(item.gorjeta)}</td></tr>` : ''}
        ${item.vt != null ? `<tr><td>Vale Transporte</td><td>${formatCurrency(item.vt)}</td></tr>` : ''}
        ${item.vr != null ? `<tr><td>Vale Refeição</td><td>${formatCurrency(item.vr)}</td></tr>` : ''}
        <tr class="sec"><td colspan="2">DESCONTOS</td></tr>
        ${item.inss != null ? `<tr><td>INSS</td><td>-${formatCurrency(item.inss)}</td></tr>` : ''}
        ${item.adiantamento != null ? `<tr><td>Adiantamento</td><td>-${formatCurrency(item.adiantamento)}</td></tr>` : ''}
        ${item.fgts != null ? `<tr><td>FGTS (referência)</td><td>${formatCurrency(item.fgts)}</td></tr>` : ''}
        ${item.outros_descontos != null ? `<tr><td>Outros Descontos</td><td>-${formatCurrency(item.outros_descontos)}</td></tr>` : ''}
        <tr class="liq"><td>VALOR LÍQUIDO</td><td>${formatCurrency(item.valor_liquido)}</td></tr>
      </table>
      ${item.observacoes ? `<p style="margin-top:20px;font-size:13px;color:#6B6B6B">${item.observacoes}</p>` : ''}
      <p class="foot">Gerado pelo HOS App · KPH Participações</p>
      </body></html>
    `;
    try {
      await Print.printAsync({ html });
    } catch {
      Alert.alert('Erro', 'Não foi possível exportar o holerite.');
    }
  }

  async function handleVerPDF(pdfPath: string) {
    const { data, error } = await supabase.storage.from('holerites').createSignedUrl(pdfPath, 3600);
    if (!error && data?.signedUrl) { Linking.openURL(data.signedUrl); return; }
    const { data: d2, error: e2 } = await supabase.storage.from('payslips').createSignedUrl(pdfPath, 3600);
    if (!e2 && d2?.signedUrl) { Linking.openURL(d2.signedUrl); return; }
    Alert.alert('Arquivo indisponível', 'Não foi possível abrir o holerite.');
  }

  // ─── Renders ─────────────────────────────────────────────────────────────────

  function renderPayslip({ item }: { item: Payslip }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatCompetencia(item.competencia)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {item.pdf_path ? (
              <TouchableOpacity onPress={() => handleVerPDF(item.pdf_path!)} style={styles.btnSecondary}>
                <Text style={styles.btnSecondaryText}>Ver PDF</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => handleExportarPDF(item)} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>Exportar</Text>
            </TouchableOpacity>
          </View>
        </View>

        <RowItem label="Salário Base" value={formatCurrency(item.salario_base)} />
        {item.horas_extras != null && <RowItem label="Horas Extras" value={formatCurrency(item.horas_extras)} />}
        {item.adicional_noturno != null && <RowItem label="Adicional Noturno" value={formatCurrency(item.adicional_noturno)} />}
        {item.gorjeta != null && <RowItem label="Gorjeta" value={formatCurrency(item.gorjeta)} valueColor={COLORS.success} />}
        {item.vt != null && <RowItem label="Vale Transporte" value={formatCurrency(item.vt)} />}
        {item.vr != null && <RowItem label="Vale Refeição" value={formatCurrency(item.vr)} />}

        <View style={styles.divider} />

        {item.inss != null && <RowItem label="INSS" value={`-${formatCurrency(item.inss)}`} valueColor={COLORS.error} />}
        {item.adiantamento != null && <RowItem label="Adiantamento" value={`-${formatCurrency(item.adiantamento)}`} valueColor={COLORS.error} />}
        {item.fgts != null && <RowItem label="FGTS" value={formatCurrency(item.fgts)} />}
        {item.outros_descontos != null && <RowItem label="Outros Descontos" value={`-${formatCurrency(item.outros_descontos)}`} valueColor={COLORS.error} />}

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.liquidoLabel}>VALOR LÍQUIDO</Text>
          <Text style={styles.liquidoValue}>{formatCurrency(item.valor_liquido)}</Text>
        </View>

        {item.observacoes ? <Text style={styles.obs}>{item.observacoes}</Text> : null}
      </View>
    );
  }

  function renderGorjeta({ item }: { item: Gorjeta }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatMesAno(item.mes, item.ano)}</Text>
          {item.recibo_url ? (
            <TouchableOpacity onPress={() => Linking.openURL(item.recibo_url!)} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>Ver recibo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <RowItem label="Valor Bruto" value={formatCurrency(item.valor_bruto)} />
        <RowItem label="Valor Líquido" value={formatCurrency(item.valor_liquido)} valueColor={COLORS.success} />
        {item.pontuacao != null && <RowItem label="Pontuação" value={`${item.pontuacao} pts`} />}
        {item.dias_trabalhados != null && <RowItem label="Dias Trabalhados" value={`${item.dias_trabalhados} dias`} />}
        {item.percentual != null && <RowItem label="Percentual" value={`${item.percentual}%`} />}
      </View>
    );
  }

  function renderAdiantamento({ item }: { item: Adiantamento }) {
    return (
      <View style={styles.card}>
        <Text style={[styles.cardPeriod, { marginBottom: 12 }]}>{formatCompetencia(item.competencia)}</Text>
        {item.pgto_15 != null && <RowItem label="Pgto. dia 15" value={formatCurrency(item.pgto_15)} />}
        {item.pgto_30 != null && <RowItem label="Pgto. dia 30" value={formatCurrency(item.pgto_30)} />}
        {item.gorjeta_1q != null && <RowItem label="Gorjeta 1ª quinzena" value={formatCurrency(item.gorjeta_1q)} valueColor={COLORS.success} />}
        {item.gorjeta_2q != null && <RowItem label="Gorjeta 2ª quinzena" value={formatCurrency(item.gorjeta_2q)} valueColor={COLORS.success} />}
        <View style={styles.divider} />
        <RowItem label="Valor Bruto" value={formatCurrency(item.valor_bruto)} />
        <View style={styles.cardRow}>
          <Text style={styles.liquidoLabel}>VALOR LÍQUIDO</Text>
          <Text style={styles.liquidoValue}>{formatCurrency(item.valor_liquido)}</Text>
        </View>
      </View>
    );
  }

  function renderHourBank({ item }: { item: HourBank }) {
    const saldoPositivo = (item.saldo ?? 0) >= 0;
    return (
      <View style={styles.card}>
        <Text style={[styles.cardPeriod, { marginBottom: 12 }]}>{formatCompetencia(item.competencia)}</Text>
        {item.horas_extras != null && <RowItem label="Horas Extras" value={`+${item.horas_extras}h`} valueColor={COLORS.success} />}
        {item.horas_debito != null && <RowItem label="Horas Débito" value={`-${item.horas_debito}h`} valueColor={COLORS.error} />}
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={styles.liquidoLabel}>SALDO</Text>
          <Text style={[styles.liquidoValue, { color: saldoPositivo ? COLORS.success : COLORS.error }]}>
            {formatSaldo(item.saldo)}
          </Text>
        </View>
      </View>
    );
  }

  // ─── Layout ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const currentData: any[] = {
    holerites: payslips,
    gorjeta: gorjetas,
    adiantamentos: adiantamentos,
    banco: hourBank,
  }[activeTab];

  const emptyMessages: Record<TabKey, string> = {
    holerites:     'Nenhum holerite disponível ainda.',
    gorjeta:       'Nenhuma gorjeta registrada.',
    adiantamentos: 'Nenhum adiantamento registrado.',
    banco:         'Nenhum registro de banco de horas.',
  };

  const emptyIcons: Record<TabKey, string> = {
    holerites:     'document-text-outline',
    gorjeta:       'cash-outline',
    adiantamentos: 'card-outline',
    banco:         'time-outline',
  };

  function renderItem({ item }: { item: any }) {
    if (activeTab === 'holerites')     return renderPayslip({ item });
    if (activeTab === 'gorjeta')       return renderGorjeta({ item });
    if (activeTab === 'adiantamentos') return renderAdiantamento({ item });
    return renderHourBank({ item });
  }

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
          >
            <Ionicons
              name={t.icon as any}
              size={15}
              color={activeTab === t.key ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={currentData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={currentData.length === 0 ? styles.listEmpty : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name={emptyIcons[activeTab] as any} size={64} color={COLORS.gray300} />
            <Text style={styles.emptyTitle}>{emptyMessages[activeTab]}</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Linha de detalhe ─────────────────────────────────────────────────────────

function RowItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.cardRow}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { justifyContent: 'center', alignItems: 'center' },

  // Tab bar
  tabBar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    height: 56,
  },
  tabBarContent: { paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 44,
    flexShrink: 0,
  },
  tabActive:      { borderBottomColor: COLORS.primary },
  tabLabel:       { fontSize: 13, fontFamily: 'InstrumentSans_500Medium', color: COLORS.textSecondary },
  tabLabelActive: { color: COLORS.primary, fontFamily: 'InstrumentSans_600SemiBold' },

  // Listas
  list:      { padding: 20, paddingBottom: 40 },
  listEmpty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    ...SHADOW.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardPeriod: { fontSize: 16, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  cardLabel:  { fontSize: 14, color: COLORS.textSecondary },
  cardValue:  { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  divider:    { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },

  // Valor líquido
  liquidoLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 0.5 },
  liquidoValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  obs:          { marginTop: 10, fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' },

  // Botões
  btnPrimary: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 13, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textInverse },
  btnSecondary: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 13, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.primary },

  // Empty state
  emptyContainer: { alignItems: 'center', gap: 16 },
  emptyTitle:     { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },
});
