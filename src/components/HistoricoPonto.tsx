import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ScrollView, KeyboardAvoidingView, Platform, Pressable, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, FONTS, RADIUS } from '../lib/types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type PunchEntry = { tipo: 'entrada' | 'saida'; horario: string; };
type PunchDay = { dia: string; punches: PunchEntry[]; };
type DayState = 'completo' | 'incompleto' | 'ausente' | 'folga';
type DayRow = {
  iso: string;
  state: DayState;
  punches: PunchEntry[];
  totalMinutes: number;
  adjustmentStatus?: string;
};
type AdjustmentRecord = {
  id: string;
  data_referencia: string;
  horario_saida_almoco: string;
  horario_retorno_almoco: string;
  motivo: string;
  status: string;
  created_at: string;
};

// ── Constantes ────────────────────────────────────────────────────────────────

// Brasil não tem horário de verão desde 2019 — UTC-3 fixo
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MOTIVOS = [
  'Esqueci de registrar',
  'Estava em atendimento',
  'Sistema indisponível',
  'Saí para entrega/serviço externo',
  'Outro',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function spToday(): string {
  return new Date(Date.now() - SP_OFFSET_MS).toISOString().slice(0, 10);
}

function isoMinusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = DAYS_SHORT[d.getUTCDay()];
  const dd = iso.slice(8);
  const mm = iso.slice(5, 7);
  return `${dow} ${dd}/${mm}`;
}

function parseMinutes(t: string): number {
  const parts = t.split(':');
  return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
}

function calcTotal(punches: PunchEntry[]): number {
  let total = 0;
  for (let i = 0; i + 1 < punches.length; i += 2) {
    const start = parseMinutes(punches[i]!.horario);
    const end = parseMinutes(punches[i + 1]!.horario);
    if (end > start) total += end - start;
  }
  return total;
}

function formatTotal(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function deriveState(punches: PunchEntry[], isWeekend: boolean): DayState {
  if (punches.length === 0) return isWeekend ? 'folga' : 'ausente';
  const last = punches[punches.length - 1];
  if (last && last.tipo === 'saida' && punches.length >= 4) return 'completo';
  return 'incompleto';
}

function getWeekBounds(): { mon: string; fri: string } {
  const today = spToday();
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Dom
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysFromMonday);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return {
    mon: monday.toISOString().slice(0, 10),
    fri: friday.toISOString().slice(0, 10),
  };
}

function isCurrentWeek(iso: string): boolean {
  const { mon, fri } = getWeekBounds();
  return iso >= mon && iso <= fri;
}

function buildGrid(data: PunchDay[], adjustmentMap: Map<string, string>): DayRow[] {
  const today = spToday();
  const map = new Map(data.map(d => [d.dia, d.punches]));
  const rows: DayRow[] = [];
  for (let i = 1; i <= 30; i++) {
    const iso = isoMinusDays(today, i);
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const punches = map.get(iso) ?? [];
    const state = deriveState(punches, isWeekend);
    rows.push({
      iso,
      state,
      punches,
      totalMinutes: calcTotal(punches),
      adjustmentStatus: adjustmentMap.get(iso),
    });
  }
  return rows;
}

// ── Sub-componentes de linha ──────────────────────────────────────────────────

function SkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <View style={[styles.skeletonRow, isLast && styles.rowLast]}>
      <View style={styles.skeletonLeft} />
      <View style={styles.skeletonRight} />
    </View>
  );
}

function RowCompleto({ row, isLast }: { row: DayRow; isLast: boolean }) {
  const entrada = row.punches.find(p => p.tipo === 'entrada')?.horario ?? '--:--';
  const lastSaida = [...row.punches].reverse().find(p => p.tipo === 'saida')?.horario ?? '--:--';
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
        <Text style={[styles.dayLabel, styles.dayLabelCompleto]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.timeVal}>{entrada}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.timeVal}>{lastSaida}</Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>{formatTotal(row.totalMinutes)}</Text>
        </View>
      </View>
    </View>
  );
}

function RowIncompleto({ row, isLast, onPress }: {
  row: DayRow;
  isLast: boolean;
  onPress?: () => void;
}) {
  const entrada = row.punches.find(p => p.tipo === 'entrada')?.horario ?? '--:--';
  const lastSaida = [...row.punches].reverse().find(p => p.tipo === 'saida')?.horario ?? null;
  const hasPending = row.adjustmentStatus === 'pendente';

  const inner = (
    <View style={[styles.row, styles.rowIncompleto, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <Ionicons name="warning-outline" size={15} color={COLORS.warning} />
        <Text style={[styles.dayLabel, styles.dayLabelIncompleto]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.timeVal}>{entrada}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={[styles.timeVal, styles.timeValAmber]}>{lastSaida ?? '--:--'}</Text>
        {hasPending ? (
          <View style={[styles.totalBadge, styles.pendingBadge]}>
            <Text style={[styles.totalText, styles.pendingText]}>Aguardando</Text>
          </View>
        ) : (
          <View style={[styles.totalBadge, styles.totalBadgeAmber]}>
            <Text style={[styles.totalText, styles.totalTextAmber]}>incompleto</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{inner}</TouchableOpacity>;
}

function RowAusente({ row, isLast }: { row: DayRow; isLast: boolean }) {
  return (
    <View style={[styles.row, styles.rowAusente, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <View style={styles.dashWrap}><Text style={styles.dashChar}>—</Text></View>
        <Text style={[styles.dayLabel, styles.dayLabelAusente]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <Text style={styles.secondaryLabel}>Sem registro</Text>
    </View>
  );
}

function RowFolga({ row, isLast }: { row: DayRow; isLast: boolean }) {
  return (
    <View style={[styles.row, styles.rowFolga, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <View style={styles.dashWrap}><Text style={[styles.dashChar, styles.dashFolga]}>—</Text></View>
        <Text style={[styles.dayLabel, styles.dayLabelFolga]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <Text style={styles.folgaLabel}>Folga</Text>
    </View>
  );
}

function DayRowItem({ row, isLast, onPressIncompleto }: {
  row: DayRow;
  isLast: boolean;
  onPressIncompleto: (iso: string) => void;
}) {
  switch (row.state) {
    case 'completo':
      return <RowCompleto row={row} isLast={isLast} />;
    case 'incompleto':
      return (
        <RowIncompleto
          row={row}
          isLast={isLast}
          onPress={row.adjustmentStatus !== 'pendente' ? () => onPressIncompleto(row.iso) : undefined}
        />
      );
    case 'ausente':
      return <RowAusente row={row} isLast={isLast} />;
    case 'folga':
      return <RowFolga row={row} isLast={isLast} />;
  }
}

// ── TimeInput ─────────────────────────────────────────────────────────────────

function TimeInput({ label, hours, minutes, onHoursChange, onMinutesChange }: {
  label: string;
  hours: string;
  minutes: string;
  onHoursChange: (h: string) => void;
  onMinutesChange: (m: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.timeInputRow}>
        <TextInput
          style={styles.timeDigit}
          value={hours}
          onChangeText={t => onHoursChange(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="08"
          placeholderTextColor={COLORS.textTertiary}
        />
        <Text style={styles.timeSep}>:</Text>
        <TextInput
          style={styles.timeDigit}
          value={minutes}
          onChangeText={t => onMinutesChange(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="00"
          placeholderTextColor={COLORS.textTertiary}
        />
      </View>
    </View>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface HistoricoPontoProps {
  employeeId: string | null;
  refreshKey?: number;
}

export function HistoricoPonto({ employeeId, refreshKey = 0 }: HistoricoPontoProps) {
  const [punchDays, setPunchDays] = useState<PunchDay[]>([]);
  const [adjustmentMap, setAdjustmentMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalDay, setModalDay] = useState<string | null>(null);
  const [saidaH, setSaidaH] = useState('');
  const [saidaM, setSaidaM] = useState('');
  const [retornoH, setRetornoH] = useState('');
  const [retornoM, setRetornoM] = useState('');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeId) return; // aguarda sessão carregar do AsyncStorage
    const eid = employeeId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [punchRes, adjRes] = await Promise.all([
        supabase.rpc('get_my_punch_history', { p_employee_id: eid, p_days: 30 }),
        supabase.rpc('get_my_adjustment_requests', { p_employee_id: eid }),
      ]);
      if (!cancelled) {
        if (!punchRes.error && Array.isArray(punchRes.data)) {
          setPunchDays(punchRes.data as PunchDay[]);
        }
        if (!adjRes.error && Array.isArray(adjRes.data)) {
          const m = new Map<string, string>();
          (adjRes.data as AdjustmentRecord[]).forEach(r => {
            // Prioriza 'pendente' se múltiplos status para a mesma data
            if (!m.has(r.data_referencia) || r.status === 'pendente') {
              m.set(r.data_referencia, r.status);
            }
          });
          setAdjustmentMap(m);
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [employeeId, refreshKey]);

  function openModal(iso: string) {
    setSaidaH(''); setSaidaM('');
    setRetornoH(''); setRetornoM('');
    setMotivo('');
    setSubmitError(null);
    setModalDay(iso);
  }

  function closeModal() {
    setModalDay(null);
    setSaidaH(''); setSaidaM('');
    setRetornoH(''); setRetornoM('');
    setMotivo('');
    setSubmitError(null);
    setSubmitting(false);
  }

  function handleIncompleto(iso: string) {
    if (!isCurrentWeek(iso)) {
      Alert.alert('Ajuste de ponto', 'Ajuste disponível apenas para dias da semana atual.');
      return;
    }
    openModal(iso);
  }

  async function submitAdjustment() {
    if (!employeeId || !modalDay) return;

    const hh = parseInt(saidaH, 10);
    const mm = parseInt(saidaM, 10);
    const rh = parseInt(retornoH, 10);
    const rm = parseInt(retornoM, 10);

    if (!saidaH || isNaN(hh) || hh > 23) { setSubmitError('Hora de saída inválida (00–23)'); return; }
    if (!saidaM || isNaN(mm) || mm > 59) { setSubmitError('Minuto de saída inválido (00–59)'); return; }
    if (!retornoH || isNaN(rh) || rh > 23) { setSubmitError('Hora de retorno inválida (00–23)'); return; }
    if (!retornoM || isNaN(rm) || rm > 59) { setSubmitError('Minuto de retorno inválido (00–59)'); return; }
    if (!motivo) { setSubmitError('Selecione o motivo'); return; }

    const saidaStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const retornoStr = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;

    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.rpc('create_punch_adjustment', {
      p_employee_id: employeeId,
      p_data_referencia: modalDay,
      p_horario_saida_almoco: saidaStr,
      p_horario_retorno_almoco: retornoStr,
      p_motivo: motivo,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    // Atualiza mapa local para refletir o novo pendente sem precisar recarregar
    setAdjustmentMap(prev => {
      const next = new Map(prev);
      next.set(modalDay, 'pendente');
      return next;
    });
    closeModal();
  }

  if (!employeeId || loading) {
    return (
      <View style={styles.container}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonRow key={i} isLast={i === 6} />
        ))}
      </View>
    );
  }

  const grid = buildGrid(punchDays, adjustmentMap);

  return (
    <>
      <View style={styles.container}>
        {grid.map((row, i) => (
          <DayRowItem
            key={row.iso}
            row={row}
            isLast={i === grid.length - 1}
            onPressIncompleto={handleIncompleto}
          />
        ))}
      </View>

      <Modal
        visible={modalDay !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeModal} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.sheet}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sheetTitle}>Solicitação de Ajuste</Text>
                {modalDay !== null && (
                  <Text style={styles.sheetDate}>{formatDayLabel(modalDay)}</Text>
                )}

                <TimeInput
                  label="Saída para almoço"
                  hours={saidaH}
                  minutes={saidaM}
                  onHoursChange={setSaidaH}
                  onMinutesChange={setSaidaM}
                />
                <TimeInput
                  label="Retorno do almoço"
                  hours={retornoH}
                  minutes={retornoM}
                  onHoursChange={setRetornoH}
                  onMinutesChange={setRetornoM}
                />

                <View style={[styles.fieldWrap, { marginBottom: 6 }]}>
                  <Text style={styles.fieldLabel}>Motivo</Text>
                </View>
                {MOTIVOS.map(m => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMotivo(m)}
                    style={styles.motivoRow}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radio, motivo === m && styles.radioSelected]}>
                      {motivo === m && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.motivoText, motivo === m && styles.motivoTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}

                {submitError !== null && (
                  <Text style={styles.errorText}>{submitError}</Text>
                )}

                <TouchableOpacity
                  onPress={submitAdjustment}
                  disabled={submitting}
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>
                    {submitting ? 'Enviando…' : 'Enviar solicitação'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={closeModal} style={styles.cancelBtn} activeOpacity={0.7}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  // ── Linhas ────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    backgroundColor: COLORS.surface,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIncompleto: { backgroundColor: COLORS.warningLight },
  rowAusente: { backgroundColor: COLORS.surface },
  rowFolga: { backgroundColor: COLORS.gray100 },

  // ── Esquerda ──────────────────────────────────────────────────────────────
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
  dayLabel: { fontSize: 13, fontFamily: FONTS.BODY_SEMIBOLD, letterSpacing: 0.1 },
  dayLabelCompleto:   { color: COLORS.textPrimary },
  dayLabelIncompleto: { color: COLORS.textPrimary },
  dayLabelAusente:    { color: COLORS.textSecondary },
  dayLabelFolga:      { color: COLORS.gray500 },
  dashWrap: { width: 15, alignItems: 'center' },
  dashChar: { fontSize: 14, color: COLORS.textTertiary, lineHeight: 16 },
  dashFolga: { color: COLORS.gray400 },

  // ── Direita ───────────────────────────────────────────────────────────────
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  timeVal: { fontSize: 13, fontFamily: FONTS.DISPLAY, color: COLORS.textPrimary, letterSpacing: -0.2 },
  timeValAmber: { color: COLORS.warning },
  arrow: { fontSize: 11, color: COLORS.textTertiary, paddingHorizontal: 1 },

  // ── Badges ────────────────────────────────────────────────────────────────
  totalBadge: {
    marginLeft: 4,
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  totalBadgeAmber: {
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warning + '44',
  },
  totalText: { fontSize: 11, fontFamily: FONTS.BODY_SEMIBOLD, color: COLORS.success },
  totalTextAmber: { color: COLORS.warning },
  pendingBadge: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary + '44' },
  pendingText: { color: COLORS.primary },

  // ── Labels secundários ─────────────────────────────────────────────────────
  secondaryLabel: { fontSize: 12, fontFamily: FONTS.BODY, color: COLORS.textTertiary, fontStyle: 'italic' },
  folgaLabel: { fontSize: 12, fontFamily: FONTS.BODY, color: COLORS.gray400 },

  // ── Skeleton ──────────────────────────────────────────────────────────────
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  skeletonLeft: { width: 90, height: 12, backgroundColor: COLORS.gray200, borderRadius: RADIUS.sm },
  skeletonRight: { flex: 1, height: 12, backgroundColor: COLORS.gray200, borderRadius: RADIUS.sm, opacity: 0.5 },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: FONTS.DISPLAY,
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sheetDate: {
    fontSize: 13,
    fontFamily: FONTS.BODY_SEMIBOLD,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },

  // ── Campos ────────────────────────────────────────────────────────────────
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: FONTS.BODY_SEMIBOLD,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeDigit: {
    width: 56,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray100,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: FONTS.DISPLAY,
    color: COLORS.textPrimary,
  },
  timeSep: {
    fontSize: 20,
    color: COLORS.textTertiary,
    fontFamily: FONTS.DISPLAY,
    lineHeight: 24,
  },

  // ── Motivo ────────────────────────────────────────────────────────────────
  motivoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.gray400,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: { borderColor: COLORS.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  motivoText: {
    fontSize: 14,
    fontFamily: FONTS.BODY,
    color: COLORS.textSecondary,
    flex: 1,
  },
  motivoTextSelected: { color: COLORS.textPrimary, fontFamily: FONTS.BODY_SEMIBOLD },

  // ── Erro ──────────────────────────────────────────────────────────────────
  errorText: {
    fontSize: 13,
    fontFamily: FONTS.BODY,
    color: COLORS.error,
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Botões ────────────────────────────────────────────────────────────────
  submitBtn: {
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: 15,
    fontFamily: FONTS.BODY_SEMIBOLD,
    color: COLORS.textInverse,
    letterSpacing: 0.2,
  },
  cancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: FONTS.BODY_MEDIUM,
    color: COLORS.textSecondary,
  },
});
