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

interface FeriasPeriodo {
  id: string;
  periodo: string;
  ferias_dias: number;
  afastamentos_dias?: number;
}

export default function FeriasScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [feriasPeriodos, setFeriasPeriodos] = useState<FeriasPeriodo[]>([]);
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
    if (employeeId) fetchFerias();
  }, [employeeId]);

  async function fetchFerias() {
    if (!employeeId) return;

    const { data, error } = await supabase
      .from('time_records')
      .select('id, periodo, ferias_dias, afastamentos_dias')
      .eq('employee_id', employeeId)
      .order('periodo', { ascending: false });

    if (error) console.error('[FERIAS] error:', error);

    const periodos = (data || []).filter(
      (r: any) => r.ferias_dias != null && Number(r.ferias_dias) > 0
    );
    setFeriasPeriodos(periodos);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFerias();
    setRefreshing(false);
  }, [employeeId]);

  function renderItem({ item }: { item: FeriasPeriodo }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sunny-outline" size={20} color={COLORS.PRIMARY} />
          <Text style={styles.cardTitle}>{formatPeriodo(item.periodo)}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Dias de Férias</Text>
          <Text style={[styles.cardValue, { color: COLORS.PRIMARY, fontSize: 18 }]}>{item.ferias_dias}</Text>
        </View>
        {item.afastamentos_dias != null && Number(item.afastamentos_dias) > 0 && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Afastamentos</Text>
            <Text style={styles.cardValue}>{item.afastamentos_dias} dias</Text>
          </View>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={feriasPeriodos.length === 0 ? styles.listEmpty : styles.list}
      data={feriasPeriodos}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="sunny-outline" size={64} color={COLORS.BORDER} />
          <Text style={styles.emptyTitle}>Nenhum registro de férias</Text>
          <Text style={styles.emptySubtitle}>Suas férias aparecerão aqui quando forem registradas.</Text>
        </View>
      }
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
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.TEXT,
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
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
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
