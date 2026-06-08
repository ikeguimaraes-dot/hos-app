import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Não agendado';
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente:  { label: 'Pendente',  color: COLORS.warning,       bg: COLORS.warningLight },
  agendado:  { label: 'Agendado',  color: COLORS.info,          bg: COLORS.infoLight },
  gozando:   { label: 'Gozando',   color: COLORS.success,       bg: COLORS.successLight },
  concluido: { label: 'Concluído', color: COLORS.textSecondary, bg: COLORS.gray200 },
};

interface Vacation {
  id: string;
  periodo_aquisitivo_inicio?: string;
  periodo_aquisitivo_fim?: string;
  inicio_gozo?: string;
  fim_gozo?: string;
  dias_direito?: number;
  dias_gozados?: number;
  dias_vendidos?: number;
  status?: string;
}

export default function FeriasScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [vacations, setVacations] = useState<Vacation[]>([]);
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
    if (employeeId) fetchFerias(employeeId);
  }, [employeeId]);

  async function fetchFerias(id: string) {
    const { data } = await supabase.rpc('get_my_vacations', { p_employee_id: id });
    setVacations(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    if (!employeeId) return;
    setRefreshing(true);
    await fetchFerias(employeeId);
    setRefreshing(false);
  }, [employeeId]);

  function renderItem({ item }: { item: Vacation }) {
    const statusCfg = STATUS_CONFIG[item.status || 'pendente'] || STATUS_CONFIG.pendente;
    const temGozo = item.inicio_gozo && item.fim_gozo;

    return (
      <View style={styles.card}>
        {/* Header com status */}
        <View style={styles.cardHeader}>
          <View style={styles.iconRow}>
            <Ionicons name="sunny-outline" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>
              {item.periodo_aquisitivo_inicio
                ? `${formatDate(item.periodo_aquisitivo_inicio)} — ${formatDate(item.periodo_aquisitivo_fim)}`
                : 'Período aquisitivo'}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.badgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Período de gozo */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PERÍODO DE GOZO</Text>
          <Text style={styles.sectionValue}>
            {temGozo ? `${formatDate(item.inicio_gozo)} — ${formatDate(item.fim_gozo)}` : 'Não agendado'}
          </Text>
        </View>

        {/* Dias */}
        <View style={styles.diasRow}>
          <View style={styles.diaBox}>
            <Text style={styles.diaNum}>{item.dias_direito ?? '—'}</Text>
            <Text style={styles.diaLabel}>Direito</Text>
          </View>
          <View style={styles.diaBox}>
            <Text style={[styles.diaNum, { color: COLORS.success }]}>{item.dias_gozados ?? 0}</Text>
            <Text style={styles.diaLabel}>Gozados</Text>
          </View>
          <View style={styles.diaBox}>
            <Text style={[styles.diaNum, { color: COLORS.warning }]}>{item.dias_vendidos ?? 0}</Text>
            <Text style={styles.diaLabel}>Vendidos</Text>
          </View>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={vacations.length === 0 ? styles.listEmpty : styles.list}
      data={vacations}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="sunny-outline" size={64} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>Suas férias ainda não foram cadastradas</Text>
          <Text style={styles.emptySubtitle}>Quando seu RH registrar, você verá os detalhes aqui.</Text>
        </View>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { justifyContent: 'center', alignItems: 'center' },
  list:      { padding: 20, paddingBottom: 40 },
  listEmpty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

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
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary, flex: 1 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, marginLeft: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  divider:   { height: 1, backgroundColor: COLORS.border, marginBottom: 12 },

  section:      { marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 0.5, marginBottom: 4 },
  sectionValue: { fontSize: 15, color: COLORS.textPrimary, fontFamily: 'InstrumentSans_500Medium' },

  diasRow: { flexDirection: 'row', gap: 12 },
  diaBox:  { flex: 1, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: 12, alignItems: 'center' },
  diaNum:  { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  diaLabel:{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  empty:        { alignItems: 'center', gap: 12 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  emptySubtitle:{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
