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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [ano, mes, dia] = value.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PdiMeta {
  id: string;
  descricao: string;
  status?: string;
}

interface Pdi {
  id: string;
  titulo: string;
  periodo?: string;
  status?: string;
  pdi_metas?: PdiMeta[];
}

interface Feedback {
  id: string;
  tipo?: string;
  conteudo?: string;
  created_at?: string;
  autor?: string;
}

interface TrainingParticipant {
  id: string;
  status?: string;
  nota?: number;
  trainings?: {
    titulo?: string;
    tipo?: string;
    carga_horaria?: number;
    data_inicio?: string;
  };
}

interface ActionTask {
  id: string;
  descricao?: string;
  status?: string;
}

interface ActionPlan {
  id: string;
  titulo?: string;
  origem?: string;
  prazo?: string;
  status?: string;
  action_plan_tasks?: ActionTask[];
}

type TabKey = 'pdi' | 'feedbacks' | 'treinamentos' | 'plano';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'pdi',         label: 'PDI',           icon: 'trending-up-outline' },
  { key: 'feedbacks',   label: 'Feedbacks',      icon: 'chatbubble-outline' },
  { key: 'treinamentos',label: 'Treinamentos',   icon: 'school-outline' },
  { key: 'plano',       label: 'Plano de Ação',  icon: 'checkmark-circle-outline' },
];

// Status configs usando tokens de feedback
const STATUS_PDI: Record<string, { label: string; color: string; bg: string }> = {
  ativo:     { label: 'Ativo',     color: COLORS.info,          bg: COLORS.infoLight },
  concluido: { label: 'Concluído', color: COLORS.success,       bg: COLORS.successLight },
  pausado:   { label: 'Pausado',   color: COLORS.warning,       bg: COLORS.warningLight },
};

const STATUS_TRAINING: Record<string, { label: string; color: string; bg: string }> = {
  inscrito:  { label: 'Inscrito',  color: COLORS.info,          bg: COLORS.infoLight },
  em_curso:  { label: 'Em curso',  color: COLORS.warning,       bg: COLORS.warningLight },
  concluido: { label: 'Concluído', color: COLORS.success,       bg: COLORS.successLight },
  cancelado: { label: 'Cancelado', color: COLORS.error,         bg: COLORS.errorLight },
};

const STATUS_PLAN: Record<string, { label: string; color: string; bg: string }> = {
  aberto:        { label: 'Aberto',        color: COLORS.info,          bg: COLORS.infoLight },
  em_andamento:  { label: 'Em andamento',  color: COLORS.warning,       bg: COLORS.warningLight },
  concluido:     { label: 'Concluído',     color: COLORS.success,       bg: COLORS.successLight },
  atrasado:      { label: 'Atrasado',      color: COLORS.error,         bg: COLORS.errorLight },
};

const TIPO_FEEDBACK: Record<string, string> = {
  positivo:    COLORS.success,
  construtivo: COLORS.warning,
  neutro:      COLORS.textSecondary,
};

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function DesenvolvimentoScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('pdi');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pdis, setPdis] = useState<Pdi[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [trainings, setTrainings] = useState<TrainingParticipant[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);

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
    const [pdiRes, feedRes, trainRes, planRes] = await Promise.allSettled([
      supabase.from('pdis').select('*, pdi_metas(*)').eq('employee_id', id).order('created_at', { ascending: false }),
      supabase.from('feedbacks').select('*').eq('employee_id', id).order('created_at', { ascending: false }),
      supabase.from('training_participants').select('*, trainings(*)').eq('employee_id', id).order('created_at', { ascending: false }),
      supabase.from('action_plans').select('*, action_plan_tasks(*)').eq('employee_id', id).order('created_at', { ascending: false }),
    ]);

    if (pdiRes.status === 'fulfilled') setPdis(pdiRes.value.data || []);
    if (feedRes.status === 'fulfilled') setFeedbacks(feedRes.value.data || []);
    if (trainRes.status === 'fulfilled') setTrainings(trainRes.value.data || []);
    if (planRes.status === 'fulfilled') setActionPlans(planRes.value.data || []);

    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    if (!employeeId) return;
    setRefreshing(true);
    await fetchAll(employeeId);
    setRefreshing(false);
  }, [employeeId]);

  // ─── Renders ─────────────────────────────────────────────────────────────────

  function renderPdi({ item }: { item: Pdi }) {
    const cfg = STATUS_PDI[item.status || ''] || { label: item.status || 'PDI', color: COLORS.textSecondary, bg: COLORS.surfaceSecondary };
    const metas = item.pdi_metas || [];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{item.titulo}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {item.periodo ? <Text style={styles.cardMeta}>{item.periodo}</Text> : null}
        {metas.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.subLabel}>METAS</Text>
            {metas.map((m) => (
              <View key={m.id} style={styles.metaRow}>
                <Ionicons
                  name={m.status === 'concluido' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={m.status === 'concluido' ? COLORS.success : COLORS.gray400}
                />
                <Text style={styles.metaText}>{m.descricao}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderFeedback({ item }: { item: Feedback }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.tipoLabel, { color: TIPO_FEEDBACK[item.tipo || ''] || COLORS.textSecondary }]}>
            {(item.tipo || 'feedback').toUpperCase()}
          </Text>
          <Text style={styles.cardMeta}>{formatDate(item.created_at)}</Text>
        </View>
        {item.conteudo ? <Text style={styles.feedbackText}>{item.conteudo}</Text> : null}
        {item.autor ? <Text style={styles.autorText}>— {item.autor}</Text> : null}
      </View>
    );
  }

  function renderTraining({ item }: { item: TrainingParticipant }) {
    const t = item.trainings || {};
    const cfg = STATUS_TRAINING[item.status || ''] || { label: item.status || '—', color: COLORS.textSecondary, bg: COLORS.surfaceSecondary };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{t.titulo || 'Treinamento'}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {t.tipo ? <Text style={styles.cardMeta}>{t.tipo}</Text> : null}
          {t.carga_horaria != null ? <Text style={styles.cardMeta}>{t.carga_horaria}h</Text> : null}
          {t.data_inicio ? <Text style={styles.cardMeta}>{formatDate(t.data_inicio)}</Text> : null}
        </View>
        {item.nota != null ? (
          <View style={styles.notaBox}>
            <Text style={styles.notaLabel}>Nota</Text>
            <Text style={styles.notaValue}>{item.nota.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderPlan({ item }: { item: ActionPlan }) {
    const cfg = STATUS_PLAN[item.status || ''] || { label: item.status || '—', color: COLORS.textSecondary, bg: COLORS.surfaceSecondary };
    const tasks = item.action_plan_tasks || [];
    const done = tasks.filter((t) => t.status === 'concluido').length;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{item.titulo || 'Plano de ação'}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
          {item.origem ? <Text style={styles.cardMeta}>Origem: {item.origem}</Text> : null}
          {item.prazo ? <Text style={styles.cardMeta}>Prazo: {formatDate(item.prazo)}</Text> : null}
        </View>
        {tasks.length > 0 ? (
          <View>
            <Text style={styles.subLabel}>TAREFAS ({done}/{tasks.length})</Text>
            {tasks.map((task) => (
              <View key={task.id} style={styles.metaRow}>
                <Ionicons
                  name={task.status === 'concluido' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={task.status === 'concluido' ? COLORS.success : COLORS.gray400}
                />
                <Text style={[styles.metaText, task.status === 'concluido' ? styles.metaTextDone : null]}>
                  {task.descricao}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
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

  const dataMap: Record<TabKey, any[]> = {
    pdi:          pdis,
    feedbacks:    feedbacks,
    treinamentos: trainings,
    plano:        actionPlans,
  };

  const emptyMessages: Record<TabKey, string> = {
    pdi:          'Seu PDI ainda não foi criado.',
    feedbacks:    'Nenhum feedback recebido ainda.',
    treinamentos: 'Nenhum treinamento registrado.',
    plano:        'Nenhum plano de ação ativo.',
  };

  const emptyIcons: Record<TabKey, string> = {
    pdi:          'trending-up-outline',
    feedbacks:    'chatbubble-outline',
    treinamentos: 'school-outline',
    plano:        'checkmark-circle-outline',
  };

  function renderItem({ item }: { item: any }) {
    if (activeTab === 'pdi')          return renderPdi({ item });
    if (activeTab === 'feedbacks')    return renderFeedback({ item });
    if (activeTab === 'treinamentos') return renderTraining({ item });
    return renderPlan({ item });
  }

  const currentData = dataMap[activeTab];

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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { justifyContent: 'center', alignItems: 'center' },

  // Tab bar
  tabBar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 56,
  },
  tabBarContent: { paddingHorizontal: 16, gap: 4, alignItems: 'center' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 44,
  },
  tabActive:      { borderBottomColor: COLORS.primary },
  tabLabel:       { fontSize: 13, fontFamily: 'InstrumentSans_500Medium', color: COLORS.textSecondary },
  tabLabelActive: { color: COLORS.primary, fontFamily: 'InstrumentSans_600SemiBold' },

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
    marginBottom: 8,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary },
  cardMeta:  { fontSize: 13, color: COLORS.textSecondary, marginRight: 8 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  badgeText: { fontSize: 12, fontWeight: '700' },

  subLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 0.5, marginBottom: 8 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  metaText: { fontSize: 14, color: COLORS.textPrimary, flex: 1 },
  metaTextDone: { color: COLORS.textTertiary, textDecorationLine: 'line-through' },

  tipoLabel:    { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  feedbackText: { fontSize: 15, color: COLORS.textPrimary, lineHeight: 22, marginTop: 4 },
  autorText:    { fontSize: 13, color: COLORS.textSecondary, marginTop: 8, fontStyle: 'italic' },

  notaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.sm,
    padding: 10,
  },
  notaLabel: { fontSize: 13, color: COLORS.textSecondary },
  notaValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },

  emptyContainer: { alignItems: 'center', gap: 16 },
  emptyTitle:     { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },
});
