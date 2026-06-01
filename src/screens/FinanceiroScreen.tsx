import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
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

function formatCurrency(value?: number | null): string {
  if (value == null) return '—';
  return `R$ ${Math.abs(value).toFixed(2).replace('.', ',')}`;
}

interface Payslip {
  id: string;
  periodo: string;
  salary_base?: number;
  total_vencimentos?: number;
  total_descontos?: number;
  valor_liquido?: number;
  fgts_mes?: number;
  inss_base?: number;
  irrf_base?: number;
  faixa_irrf?: string;
  pdf_path?: string;
}

interface TipRecord {
  id: string;
  periodo: string;
  valor?: number;
}

interface TransportVoucher {
  id: string;
  periodo: string;
  valor?: number;
  quantidade?: number;
}

export default function FinanceiroScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [tips, setTips] = useState<TipRecord[]>([]);
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

    const [payslipRes, tipsRes, transportRes] = await Promise.all([
      supabase
        .from('payslips')
        .select('*')
        .eq('employee_id', employeeId)
        .order('periodo', { ascending: false }),
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

    if (payslipRes.error) console.error('[FINANCEIRO] payslips error:', payslipRes.error);
    if (tipsRes.error) console.error('[FINANCEIRO] tips error:', tipsRes.error);
    if (transportRes.error) console.error('[FINANCEIRO] transport error:', transportRes.error);

    setPayslips(payslipRes.data || []);
    setTips(tipsRes.data || []);
    setTransport(transportRes.data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [employeeId]);

  async function handleVerPDF(pdfPath: string) {
    const { data, error } = await supabase.storage
      .from('holerites')
      .createSignedUrl(pdfPath, 3600);

    if (!error && data?.signedUrl) {
      Linking.openURL(data.signedUrl);
      return;
    }

    const { data: data2, error: error2 } = await supabase.storage
      .from('payslips')
      .createSignedUrl(pdfPath, 3600);

    if (!error2 && data2?.signedUrl) {
      Linking.openURL(data2.signedUrl);
      return;
    }

    console.error('[FINANCEIRO] PDF error:', error, error2);
    Alert.alert('Erro', 'Não foi possível abrir o PDF');
  }

  type SectionData = { title: string; data: any[]; type: string };

  const sections: SectionData[] = [
    { title: 'Holerites', data: payslips, type: 'payslip' },
    { title: 'Gorjetas', data: tips, type: 'tip' },
    { title: 'Vale Transporte', data: transport, type: 'transport' },
  ];

  function renderPayslipCard(item: Payslip) {
    return (
      <View style={styles.card}>
        {/* Header: Período + Ver PDF */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
          {item.pdf_path ? (
            <TouchableOpacity
              onPress={() => handleVerPDF(item.pdf_path!).catch(e => Alert.alert('Erro', e?.message ?? 'Não foi possível abrir o PDF'))}
              style={styles.pdfButton}
            >
              <Text style={styles.pdfButtonText}>Ver PDF →</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Salário base */}
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Salário Base</Text>
          <Text style={styles.cardValue}>{formatCurrency(item.salary_base)}</Text>
        </View>

        {/* Vencimentos */}
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Total Vencimentos</Text>
          <Text style={[styles.cardValue, { color: COLORS.SUCCESS }]}>{formatCurrency(item.total_vencimentos)}</Text>
        </View>

        {/* Descontos */}
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Total Descontos</Text>
          <Text style={[styles.cardValue, { color: COLORS.ERROR }]}>
            {item.total_descontos != null ? `-R$ ${Math.abs(item.total_descontos).toFixed(2).replace('.', ',')}` : '—'}
          </Text>
        </View>

        {/* Separador */}
        <View style={styles.divider} />

        {/* Valor líquido */}
        <View style={styles.cardRow}>
          <Text style={styles.liquidoLabel}>VALOR LÍQUIDO</Text>
          <Text style={styles.liquidoValue}>{formatCurrency(item.valor_liquido)}</Text>
        </View>

        {/* Separador */}
        <View style={styles.divider} />

        {/* Detalhes secundários */}
        {item.fgts_mes != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabelSmall}>FGTS do mês</Text>
            <Text style={styles.cardValueSmall}>{formatCurrency(item.fgts_mes)}</Text>
          </View>
        )}
        {item.inss_base != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabelSmall}>Base INSS</Text>
            <Text style={styles.cardValueSmall}>{formatCurrency(item.inss_base)}</Text>
          </View>
        )}
        {item.irrf_base != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabelSmall}>Base IRRF</Text>
            <Text style={styles.cardValueSmall}>{formatCurrency(item.irrf_base)}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderItem({ item, section }: { item: any; section: SectionData }) {
    if (section.type === 'payslip') return renderPayslipCard(item);
    if (section.type === 'tip') {
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
            <Text style={[styles.cardValue, { color: COLORS.SUCCESS }]}>{formatCurrency(item.valor)}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
          <Text style={styles.cardValue}>{formatCurrency(item.valor)}</Text>
        </View>
        {item.quantidade != null && (
          <Text style={styles.cardMeta}>{item.quantidade} dias</Text>
        )}
      </View>
    );
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

  const hasData = payslips.length > 0 || tips.length > 0 || transport.length > 0;

  if (!hasData) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="wallet-outline" size={64} color={COLORS.BORDER} />
        <Text style={styles.emptyTitle}>Nenhum lançamento este mês</Text>
        <Text style={styles.emptySubtitle}>Seus holerites e benefícios aparecem aqui.</Text>
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
    marginBottom: 12,
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
    marginBottom: 12,
  },
  cardPeriod: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  pdfButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  pdfButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.PRIMARY,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
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
  cardLabelSmall: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
  },
  cardValueSmall: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.BORDER,
    marginVertical: 10,
  },
  liquidoLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  liquidoValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.PRIMARY,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
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
