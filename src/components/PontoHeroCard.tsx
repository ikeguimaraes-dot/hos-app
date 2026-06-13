import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

export type PontoState = 'idle' | 'working' | 'lunch' | 'done';

export function derivePontoState(punches: { tipo: string; timestamp_punch: string }[]): PontoState {
  const last = punches.length > 0 ? punches[punches.length - 1] : null;
  if (!last) return 'idle';
  if (last.tipo === 'entrada') return 'working';
  if (punches.length >= 4) return 'done';
  return 'lunch';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return '—'; }
}

function getElapsed(since: string): string {
  const ms = Math.max(0, Date.now() - new Date(since).getTime());
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

function calcTotalWorked(punches: { tipo: string; timestamp_punch: string }[]): string {
  let totalMs = 0;
  for (let i = 0; i + 1 < punches.length; i += 2) {
    const a = new Date(punches[i].timestamp_punch).getTime();
    const b = new Date(punches[i + 1].timestamp_punch).getTime();
    if (b > a) totalMs += b - a;
  }
  const totalMins = Math.floor(totalMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

interface PontoHeroCardProps {
  pontoState: PontoState;
  todayPunches: { tipo: string; timestamp_punch: string }[];
  firstEntrada: { tipo: string; timestamp_punch: string } | null;
  onAction: () => void;
  actionLoading?: boolean;
  actionLoadingLabel?: string;
}

export function PontoHeroCard({
  pontoState,
  todayPunches,
  firstEntrada,
  onAction,
  actionLoading = false,
  actionLoadingLabel = 'Processando...',
}: PontoHeroCardProps) {
  const [, setTick] = useState(0);
  const lastPunch = todayPunches.length > 0 ? todayPunches[todayPunches.length - 1] : null;

  useEffect(() => {
    if (pontoState === 'working' || pontoState === 'lunch') {
      const id = setInterval(() => setTick(t => t + 1), 60000);
      return () => clearInterval(id);
    }
  }, [pontoState]);

  if (pontoState === 'idle') {
    return (
      <View style={[heroStyles.card, heroStyles.cardIdle]}>
        <View style={heroStyles.stateRow}>
          <View style={[heroStyles.dot, heroStyles.dotAmber]} />
          <Text style={heroStyles.stateLabel}>Sem registro hoje</Text>
        </View>
        <Text style={heroStyles.idleText}>Você ainda não registrou{'\n'}sua entrada</Text>
        <HeroButton
          label="Registrar entrada"
          btnStyle={[heroStyles.actionBtn, heroStyles.btnBrasa]}
          textColor="#FFF"
          onPress={onAction}
          loading={actionLoading}
          loadingLabel={actionLoadingLabel}
        />
      </View>
    );
  }

  if (pontoState === 'working') {
    const since = firstEntrada ? formatTime(firstEntrada.timestamp_punch) : '—';
    const elapsed = firstEntrada ? getElapsed(firstEntrada.timestamp_punch) : '—';
    return (
      <View style={[heroStyles.card, heroStyles.cardWorking]}>
        <View style={heroStyles.stateRow}>
          <View style={[heroStyles.dot, heroStyles.dotGreen]} />
          <Text style={heroStyles.stateLabel}>Trabalhando</Text>
        </View>
        <Text style={heroStyles.timePrefix}>desde</Text>
        <Text style={heroStyles.timeLarge}>{since}</Text>
        <Text style={heroStyles.elapsed}>{elapsed} trabalhadas</Text>
        <HeroButton
          label="Registrar saída"
          btnStyle={[heroStyles.actionBtn, heroStyles.btnDark]}
          textColor="#FFF"
          onPress={onAction}
          loading={actionLoading}
          loadingLabel={actionLoadingLabel}
        />
      </View>
    );
  }

  if (pontoState === 'lunch') {
    const since = lastPunch ? formatTime(lastPunch.timestamp_punch) : '—';
    const elapsed = lastPunch ? getElapsed(lastPunch.timestamp_punch) : '—';
    return (
      <View style={[heroStyles.card, heroStyles.cardLunch]}>
        <View style={heroStyles.stateRow}>
          <View style={[heroStyles.dot, heroStyles.dotAmber]} />
          <Text style={heroStyles.stateLabel}>Em intervalo</Text>
        </View>
        <Text style={heroStyles.timePrefix}>desde</Text>
        <Text style={heroStyles.timeLarge}>{since}</Text>
        <Text style={heroStyles.elapsed}>{elapsed} de pausa</Text>
        <HeroButton
          label="Registrar retorno"
          btnStyle={[heroStyles.actionBtn, heroStyles.btnAmber]}
          textColor={COLORS.CARVAO}
          onPress={onAction}
          loading={actionLoading}
          loadingLabel={actionLoadingLabel}
        />
      </View>
    );
  }

  // done
  const startTime = firstEntrada ? formatTime(firstEntrada.timestamp_punch) : '—';
  const endTime = lastPunch ? formatTime(lastPunch.timestamp_punch) : '—';
  const worked = calcTotalWorked(todayPunches);
  return (
    <View style={[heroStyles.card, heroStyles.cardDone]}>
      <View style={heroStyles.stateRow}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        <Text style={[heroStyles.stateLabel, { marginLeft: 6 }]}>Dia concluído</Text>
      </View>
      <Text style={heroStyles.timePrefix}>hoje</Text>
      <Text style={heroStyles.timeLarge}>{startTime} — {endTime}</Text>
      <Text style={heroStyles.elapsed}>{worked} trabalhadas</Text>
    </View>
  );
}

function HeroButton({
  label, btnStyle, textColor, onPress, loading, loadingLabel,
}: {
  label: string;
  btnStyle: any;
  textColor: string;
  onPress: () => void;
  loading: boolean;
  loadingLabel: string;
}) {
  return (
    <TouchableOpacity
      style={btnStyle}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[heroStyles.actionBtnText, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    ...SHADOW.md,
  },
  cardIdle:    { backgroundColor: COLORS.primaryLight, borderColor: '#E8A020' },
  cardWorking: { backgroundColor: COLORS.successLight, borderColor: '#A7D9C3' },
  cardLunch:   { backgroundColor: '#FDF0D4',           borderColor: '#E8A020' },
  cardDone:    { backgroundColor: COLORS.successLight, borderColor: '#A7D9C3' },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotGreen: { backgroundColor: COLORS.success },
  dotAmber: { backgroundColor: '#E8A020' },
  stateLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timePrefix: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
  },
  timeLarge: {
    fontSize: 36,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.CARVAO,
    letterSpacing: -0.5,
    marginBottom: 4,
    lineHeight: 44,
  },
  elapsed: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  idleText: {
    fontSize: 18,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textPrimary,
    lineHeight: 26,
    marginBottom: 24,
  },
  actionBtn: {
    minHeight: 56,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  btnBrasa: { backgroundColor: COLORS.primary },
  btnDark:  { backgroundColor: COLORS.CARVAO },
  btnAmber: { backgroundColor: '#E8A020' },
  actionBtnText: {
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
    letterSpacing: 0.2,
  },
});
