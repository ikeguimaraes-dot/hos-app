import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  ordem: number;
  texto: string;
  tipo: 'escala' | 'texto_livre';
}

interface ActiveSurvey {
  survey_id: string;
  titulo: string;
  descricao?: string;
  tipo?: string;
  questions: Question[];
}

// ─── Rostos KPH (fallback emoji — react-native-svg não disponível) ────────────

const FACES = [
  { valor: 1, label: 'Muito insatisfeito', cor: '#D85A30', fill: '#FAECE7', emoji: '😢' },
  { valor: 2, label: 'Insatisfeito',       cor: '#BA7517', fill: '#FAEEDA', emoji: '😞' },
  { valor: 3, label: 'Neutro',             cor: '#888780', fill: '#F1EFE8', emoji: '😐' },
  { valor: 4, label: 'Satisfeito',         cor: '#1D9E75', fill: '#E1F5EE', emoji: '😊' },
  { valor: 5, label: 'Muito satisfeito',   cor: '#639922', fill: '#EAF3DE', emoji: '😄' },
];

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function ClimaScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [survey, setSurvey] = useState<ActiveSurvey | null>(null);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, { valor_escala?: number; texto_livre?: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
      if (session.employee.unit_id) setUnitId(session.employee.unit_id);
    })();
  }, []);

  useEffect(() => {
    if (unitId && employeeId) loadSurvey(unitId, employeeId);
  }, [unitId, employeeId]);

  async function loadSurvey(uid: string, empId: string) {
    try {
      const { data: surveyData, error: surveyErr } = await supabase.rpc('get_active_survey', {
        p_unit_id: uid,
      });

      if (surveyErr || !surveyData) {
        setSurvey(null);
        return;
      }

      setSurvey(surveyData as ActiveSurvey);

      const { data: answered } = await supabase.rpc('check_survey_response', {
        p_employee_id: empId,
        p_survey_id: surveyData.survey_id,
      });
      setAlreadyAnswered(!!answered);
    } catch {
      setSurvey(null);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    if (!unitId || !employeeId) return;
    setRefreshing(true);
    setSubmitted(false);
    setRespostas({});
    await loadSurvey(unitId, employeeId);
    setRefreshing(false);
  }, [unitId, employeeId]);

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!survey || !employeeId) return;

    setSubmitting(true);

    const p_responses = Object.entries(respostas).map(([question_id, v]) => ({
      question_id,
      valor_escala: v.valor_escala ?? null,
      texto_livre: v.texto_livre ?? null,
    }));

    const { error } = await supabase.rpc('submit_survey_responses', {
      p_employee_id: employeeId,
      p_survey_id: survey.survey_id,
      p_responses: p_responses,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Erro', 'Não foi possível enviar. Tente novamente.');
      return;
    }

    setSubmitted(true);
  }

  // ─── Validação ──────────────────────────────────────────────────────────────

  function isFormValid(): boolean {
    if (!survey) return false;
    return (survey.questions || [])
      .filter((q) => q.tipo === 'escala')
      .every((q) => respostas[q.id]?.valor_escala != null);
  }

  // ─── Render rostos ───────────────────────────────────────────────────────────

  function renderFaces(questionId: string) {
    const selecionado = respostas[questionId]?.valor_escala;
    const faceSelecionada = selecionado != null ? FACES.find((f) => f.valor === selecionado) : null;

    return (
      <View>
        <View style={styles.facesRow}>
          {FACES.map((face) => {
            const isSelected = selecionado === face.valor;
            return (
              <TouchableOpacity
                key={face.valor}
                onPress={() =>
                  setRespostas((prev) => ({
                    ...prev,
                    [questionId]: { ...prev[questionId], valor_escala: face.valor },
                  }))
                }
                style={[
                  styles.faceBtn,
                  { backgroundColor: face.fill, borderColor: face.cor },
                  isSelected && styles.faceBtnSelected,
                ]}
                accessibilityLabel={face.label}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={styles.faceEmoji}>{face.emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {faceSelecionada && (
          <Text style={[styles.faceLabel, { color: faceSelecionada.cor }]}>
            {faceSelecionada.label}
          </Text>
        )}
      </View>
    );
  }

  // ─── Render pergunta ─────────────────────────────────────────────────────────

  function renderQuestion(q: Question) {
    return (
      <View key={q.id} style={styles.questionCard}>
        <Text style={styles.questionText}>{q.texto}</Text>

        {q.tipo === 'escala' && renderFaces(q.id)}

        {q.tipo === 'texto_livre' && (
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={4}
            placeholder="Escreva sua resposta (opcional)..."
            placeholderTextColor={COLORS.textTertiary}
            value={respostas[q.id]?.texto_livre || ''}
            onChangeText={(v) =>
              setRespostas((prev) => ({
                ...prev,
                [q.id]: { ...prev[q.id], texto_livre: v },
              }))
            }
          />
        )}
      </View>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ─── Estado 2: Já respondida ou recém submetida ───────────────────────────────

  if (alreadyAnswered || submitted) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centeredFlex}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.answeredCard}>
          <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
          <Text style={styles.answeredTitle}>Obrigado pelo seu feedback!</Text>
          <Text style={styles.answeredSubtitle}>Sua resposta foi registrada com sucesso.</Text>
        </View>
      </ScrollView>
    );
  }

  // ─── Estado 3: Sem pesquisa ativa ────────────────────────────────────────────

  if (!survey) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centeredFlex}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Ionicons name="cloud-outline" size={64} color={COLORS.gray300} />
        <Text style={styles.emptyTitle}>Nenhuma pesquisa ativa</Text>
        <Text style={styles.emptySubtitle}>
          Quando seu gestor publicar uma pesquisa, ela aparecerá aqui
        </Text>
      </ScrollView>
    );
  }

  // ─── Estado 1: Pesquisa ativa ────────────────────────────────────────────────

  const valid = isFormValid();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{survey.titulo}</Text>
        {survey.descricao ? (
          <Text style={styles.headerDesc}>{survey.descricao}</Text>
        ) : null}
      </View>

      {/* Perguntas */}
      {(survey.questions || [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map(renderQuestion)}

      {/* Botão enviar */}
      <TouchableOpacity
        style={[styles.btnSubmit, (!valid || submitting) && styles.btnSubmitDisabled]}
        onPress={handleSubmit}
        disabled={!valid || submitting}
        accessibilityLabel="Enviar resposta"
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={styles.btnSubmitText}>Enviar resposta</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.background },
  center:       { justifyContent: 'center', alignItems: 'center' },
  centeredFlex: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  content:      { padding: 20, paddingBottom: 48 },

  // Header
  header: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 16,
    ...SHADOW.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  headerDesc: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // Perguntas
  questionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    ...SHADOW.sm,
  },
  questionText: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.textPrimary,
    lineHeight: 22,
    marginBottom: 16,
  },

  // Rostos KPH
  facesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  faceBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  faceBtnSelected: {
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  faceEmoji: { fontSize: 24 },
  faceLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },

  // Texto livre
  textInput: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    fontSize: 15,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Botão submit
  btnSubmit: {
    backgroundColor: '#C4622D',
    borderRadius: RADIUS.md,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnSubmitDisabled: {
    opacity: 0.45,
  },
  btnSubmitText: {
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: '#FFF',
  },

  // Estado 2 — Respondida
  answeredCard: {
    backgroundColor: '#E1F5EE',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#A7D9C3',
    padding: 32,
    alignItems: 'center',
    gap: 12,
    maxWidth: 320,
    width: '100%',
  },
  answeredTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  answeredSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Estado 3 — Sem pesquisa
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
});
