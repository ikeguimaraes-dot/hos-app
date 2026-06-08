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
  Modal,
  ScrollView,
  TextInput,
  Switch,
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

interface SurveyQuestion {
  id: string;
  texto: string;
  tipo: 'escala' | 'texto' | 'multipla_escolha';
  opcoes?: string[];
  ordem?: number;
}

interface Survey {
  id: string;
  titulo?: string;
  descricao?: string;
  prazo?: string;
  status?: string;
  unit_id?: string;
  already_answered?: boolean;
  respondido?: boolean;
  questions?: SurveyQuestion[];
}

interface Respostas {
  [questionId: string]: {
    valor?: number;
    texto?: string;
    opcao?: string;
  };
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function ClimaScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal de resposta
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);

  const [respostas, setRespostas] = useState<Respostas>({});
  const [anonimo, setAnonimo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      if (session.employee.unit_id) setUnitId(session.employee.unit_id);
    })();
  }, []);

  useEffect(() => {
    if (unitId && employeeId) fetchSurveys(unitId, employeeId);
  }, [unitId, employeeId]);

  async function fetchSurveys(uid: string, empId: string) {
    try {
      const { data } = await supabase.rpc('get_unit_surveys', {
        p_unit_id: uid,
        p_employee_id: empId,
      });
      const surveyList: Survey[] = (data || []).map((s: any) => ({
        ...s,
        respondido: s.already_answered,
      }));
      setSurveys(surveyList);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    if (!unitId || !employeeId) return;
    setRefreshing(true);
    await fetchSurveys(unitId, employeeId);
    setRefreshing(false);
  }, [unitId, employeeId]);

  // ─── Modal ────────────────────────────────────────────────────────────────────

  function handleOpenSurvey(survey: Survey) {
    setSelectedSurvey(survey);
    setRespostas({});
    setAnonimo(false);
    setQuestions(survey.questions || []);
  }

  function setResposta(qId: string, field: 'valor' | 'texto' | 'opcao', value: any) {
    setRespostas((prev) => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));
  }

  async function handleSubmit() {
    if (!selectedSurvey || !employeeId) return;

    const unanswered = questions.filter((q) => {
      const r = respostas[q.id];
      if (!r) return true;
      if (q.tipo === 'escala') return r.valor == null;
      if (q.tipo === 'texto') return !r.texto?.trim();
      if (q.tipo === 'multipla_escolha') return !r.opcao;
      return false;
    });

    if (unanswered.length > 0) {
      Alert.alert('Atenção', 'Responda todas as perguntas antes de enviar.');
      return;
    }

    setSubmitting(true);

    const rows = questions.map((q) => ({
      survey_id: selectedSurvey.id,
      question_id: q.id,
      employee_id: anonimo ? null : employeeId,
      resposta_valor: respostas[q.id]?.valor ?? null,
      resposta_texto: respostas[q.id]?.texto ?? null,
      resposta_opcao: respostas[q.id]?.opcao ?? null,
    }));

    const { error } = await supabase.rpc('submit_survey_responses', { p_responses: rows });
    setSubmitting(false);

    if (error) {
      Alert.alert('Erro', 'Não foi possível enviar suas respostas. Tente novamente.');
      return;
    }

    setSurveys((prev) => prev.map((s) => (s.id === selectedSurvey.id ? { ...s, respondido: true } : s)));
    setSelectedSurvey(null);
    Alert.alert('Obrigado!', 'Suas respostas foram enviadas com sucesso.');
  }

  // ─── Render pergunta ──────────────────────────────────────────────────────────

  function renderQuestion(q: SurveyQuestion) {
    return (
      <View key={q.id} style={styles.questionCard}>
        <Text style={styles.questionText}>{q.texto}</Text>

        {q.tipo === 'escala' && (
          <View>
            <View style={styles.escalaRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setResposta(q.id, 'valor', n)}
                  style={[styles.escalaBtn, respostas[q.id]?.valor === n && styles.escalaBtnActive]}
                >
                  <Text style={[styles.escalaBtnText, respostas[q.id]?.valor === n && styles.escalaBtnTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.escalaLabels}>
              <Text style={styles.escalaLabelText}>Discordo</Text>
              <Text style={styles.escalaLabelText}>Concordo</Text>
            </View>
          </View>
        )}

        {q.tipo === 'texto' && (
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={4}
            placeholder="Escreva sua resposta..."
            placeholderTextColor={COLORS.textTertiary}
            value={respostas[q.id]?.texto || ''}
            onChangeText={(v) => setResposta(q.id, 'texto', v)}
          />
        )}

        {q.tipo === 'multipla_escolha' && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {(q.opcoes || []).map((opcao) => (
              <TouchableOpacity
                key={opcao}
                onPress={() => setResposta(q.id, 'opcao', opcao)}
                style={[styles.opcaoBtn, respostas[q.id]?.opcao === opcao && styles.opcaoBtnActive]}
              >
                <Ionicons
                  name={respostas[q.id]?.opcao === opcao ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={respostas[q.id]?.opcao === opcao ? COLORS.primary : COLORS.gray400}
                />
                <Text style={[styles.opcaoText, respostas[q.id]?.opcao === opcao && styles.opcaoTextActive]}>
                  {opcao}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ─── Render card de survey ────────────────────────────────────────────────────

  function renderSurvey({ item }: { item: Survey }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{item.titulo || 'Pesquisa de Clima'}</Text>
          {item.respondido ? (
            <View style={[styles.badge, { backgroundColor: COLORS.successLight }]}>
              <Text style={[styles.badgeText, { color: COLORS.success }]}>Respondido ✓</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: COLORS.infoLight }]}>
              <Text style={[styles.badgeText, { color: COLORS.info }]}>Aberto</Text>
            </View>
          )}
        </View>

        {item.descricao ? <Text style={styles.cardDesc}>{item.descricao}</Text> : null}
        {item.prazo ? <Text style={styles.cardMeta}>Prazo: {formatDate(item.prazo)}</Text> : null}

        {!item.respondido && (
          <TouchableOpacity onPress={() => handleOpenSurvey(item)} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Responder pesquisa</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.textInverse} />
          </TouchableOpacity>
        )}
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

  return (
    <View style={styles.container}>
      <FlatList
        data={surveys}
        keyExtractor={(item) => item.id}
        renderItem={renderSurvey}
        contentContainerStyle={surveys.length === 0 ? styles.listEmpty : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="happy-outline" size={64} color={COLORS.gray300} />
            <Text style={styles.emptyTitle}>Nenhuma pesquisa ativa no momento</Text>
          </View>
        }
      />

      {/* Modal de respostas */}
      <Modal
        visible={!!selectedSurvey}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedSurvey(null)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedSurvey?.titulo || 'Pesquisa'}</Text>
            <TouchableOpacity onPress={() => setSelectedSurvey(null)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
              {questions.map(renderQuestion)}

              {/* Anonimato */}
              <View style={styles.anonimoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.anonimoLabel}>Responder anonimamente</Text>
                  <Text style={styles.anonimoSub}>Seu nome não será vinculado às respostas</Text>
                </View>
                <Switch
                  value={anonimo}
                  onValueChange={setAnonimo}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor={COLORS.white}
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                style={[styles.btnEnviar, submitting && { opacity: 0.6 }]}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={COLORS.textInverse} />
                ) : (
                  <Text style={styles.btnEnviarText}>Enviar respostas</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
    marginBottom: 8,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary },
  cardDesc:  { fontSize: 14, color: COLORS.textSecondary, marginBottom: 6, lineHeight: 20 },
  cardMeta:  { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  badgeText: { fontSize: 12, fontWeight: '700' },

  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    minHeight: 44,
  },
  btnPrimaryText: { fontSize: 15, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textInverse },

  emptyContainer: { alignItems: 'center', gap: 16 },
  emptyTitle:     { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center' },

  // Modal
  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 17, fontFamily: 'Fraunces_700Bold', color: COLORS.textPrimary, flex: 1 },
  modalClose: { padding: 4, minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  modalContent: { padding: 20, paddingBottom: 60 },

  // Perguntas
  questionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 16,
    ...SHADOW.sm,
  },
  questionText: { fontSize: 15, color: COLORS.textPrimary, lineHeight: 22, marginBottom: 14 },

  // Escala
  escalaRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  escalaBtn: {
    width: 30,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  escalaBtnActive:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  escalaBtnText:       { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  escalaBtnTextActive: { color: COLORS.textInverse },
  escalaLabels:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  escalaLabelText:     { fontSize: 11, color: COLORS.textTertiary },

  // Texto livre
  textInput: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Múltipla escolha
  opcaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
  },
  opcaoBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  opcaoText:      { fontSize: 14, color: COLORS.textPrimary, flex: 1 },
  opcaoTextActive:{ color: COLORS.primary, fontFamily: 'InstrumentSans_600SemiBold' },

  // Anonimato
  anonimoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  anonimoLabel: { fontSize: 15, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary },
  anonimoSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Enviar
  btnEnviar: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  btnEnviarText: { fontSize: 16, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textInverse },
});
