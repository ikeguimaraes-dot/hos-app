import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, FONTS, RADIUS } from '../lib/types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type PunchEntry = {
  tipo: 'entrada' | 'saida';
  horario: string; // 'HH:MM' já convertido para BRT pela RPC
};

type PunchDay = {
  dia: string; // 'YYYY-MM-DD'
  punches: PunchEntry[];
};

type DayState = 'completo' | 'incompleto' | 'ausente' | 'folga';

type DayRow = {
  iso: string;
  state: DayState;
  punches: PunchEntry[];
  totalMinutes: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Brasil não tem horário de verão desde 2019 — UTC-3 fixo
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

function buildGrid(data: PunchDay[]): DayRow[] {
  const today = spToday();
  const map = new Map(data.map(d => [d.dia, d.punches]));
  const rows: DayRow[] = [];

  for (let i = 1; i <= 30; i++) {
    const iso = isoMinusDays(today, i);
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const punches = map.get(iso) ?? [];
    const state = deriveState(punches, isWeekend);
    rows.push({ iso, state, punches, totalMinutes: calcTotal(punches) });
  }

  return rows;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

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

function RowIncompleto({ row, isLast }: { row: DayRow; isLast: boolean }) {
  const entrada = row.punches.find(p => p.tipo === 'entrada')?.horario ?? '--:--';
  const lastSaida = [...row.punches].reverse().find(p => p.tipo === 'saida')?.horario ?? null;
  return (
    <View style={[styles.row, styles.rowIncompleto, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <Ionicons name="warning-outline" size={15} color={COLORS.warning} />
        <Text style={[styles.dayLabel, styles.dayLabelIncompleto]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.timeVal}>{entrada}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={[styles.timeVal, styles.timeValAmber]}>
          {lastSaida ?? '--:--'}
        </Text>
        <View style={[styles.totalBadge, styles.totalBadgeAmber]}>
          <Text style={[styles.totalText, styles.totalTextAmber]}>incompleto</Text>
        </View>
      </View>
    </View>
  );
}

function RowAusente({ row, isLast }: { row: DayRow; isLast: boolean }) {
  return (
    <View style={[styles.row, styles.rowAusente, isLast && styles.rowLast]}>
      <View style={styles.rowLeft}>
        <View style={styles.dashWrap}>
          <Text style={styles.dashChar}>—</Text>
        </View>
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
        <View style={styles.dashWrap}>
          <Text style={[styles.dashChar, styles.dashFolga]}>—</Text>
        </View>
        <Text style={[styles.dayLabel, styles.dayLabelFolga]}>{formatDayLabel(row.iso)}</Text>
      </View>
      <Text style={styles.folgaLabel}>Folga</Text>
    </View>
  );
}

function DayRowItem({ row, isLast }: { row: DayRow; isLast: boolean }) {
  switch (row.state) {
    case 'completo':   return <RowCompleto row={row} isLast={isLast} />;
    case 'incompleto': return <RowIncompleto row={row} isLast={isLast} />;
    case 'ausente':    return <RowAusente row={row} isLast={isLast} />;
    case 'folga':      return <RowFolga row={row} isLast={isLast} />;
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

interface HistoricoPontoProps {
  employeeId: string | null;
  refreshKey?: number;
}

export function HistoricoPonto({ employeeId, refreshKey = 0 }: HistoricoPontoProps) {
  const [punchDays, setPunchDays] = useState<PunchDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return; // aguarda sessão carregar do AsyncStorage
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_my_punch_history', {
        p_employee_id: employeeId,
        p_days: 30,
      });
      if (!cancelled) {
        if (!error && Array.isArray(data)) {
          setPunchDays(data as PunchDay[]);
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [employeeId, refreshKey]);

  // employeeId ainda null → sessão não carregou, mantém skeleton
  if (!employeeId || loading) {
    return (
      <View style={styles.container}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonRow key={i} isLast={i === 6} />
        ))}
      </View>
    );
  }

  const grid = buildGrid(punchDays);

  return (
    <View style={styles.container}>
      {grid.map((row, i) => (
        <DayRowItem key={row.iso} row={row} isLast={i === grid.length - 1} />
      ))}
    </View>
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
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIncompleto: {
    backgroundColor: COLORS.warningLight,
  },
  rowAusente: {
    backgroundColor: COLORS.surface,
  },
  rowFolga: {
    backgroundColor: COLORS.gray100,
  },

  // ── Esquerda: ícone + data ─────────────────────────────────────────────────
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: FONTS.BODY_SEMIBOLD,
    letterSpacing: 0.1,
  },
  dayLabelCompleto:   { color: COLORS.textPrimary },
  dayLabelIncompleto: { color: COLORS.textPrimary },
  dayLabelAusente:    { color: COLORS.textSecondary },
  dayLabelFolga:      { color: COLORS.gray500 },

  dashWrap: {
    width: 15,
    alignItems: 'center',
  },
  dashChar: {
    fontSize: 14,
    color: COLORS.textTertiary,
    lineHeight: 16,
  },
  dashFolga: {
    color: COLORS.gray400,
  },

  // ── Direita: horários + total ──────────────────────────────────────────────
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  timeVal: {
    fontSize: 13,
    fontFamily: FONTS.DISPLAY,
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  timeValAmber: {
    color: COLORS.warning,
  },
  arrow: {
    fontSize: 11,
    color: COLORS.textTertiary,
    paddingHorizontal: 1,
  },

  // ── Badge de total ─────────────────────────────────────────────────────────
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
  totalText: {
    fontSize: 11,
    fontFamily: FONTS.BODY_SEMIBOLD,
    color: COLORS.success,
  },
  totalTextAmber: {
    color: COLORS.warning,
  },

  // ── Labels secundários ─────────────────────────────────────────────────────
  secondaryLabel: {
    fontSize: 12,
    fontFamily: FONTS.BODY,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
  folgaLabel: {
    fontSize: 12,
    fontFamily: FONTS.BODY,
    color: COLORS.gray400,
  },

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
  skeletonLeft: {
    width: 90,
    height: 12,
    backgroundColor: COLORS.gray200,
    borderRadius: RADIUS.sm,
  },
  skeletonRight: {
    flex: 1,
    height: 12,
    backgroundColor: COLORS.gray200,
    borderRadius: RADIUS.sm,
    opacity: 0.5,
  },
});
