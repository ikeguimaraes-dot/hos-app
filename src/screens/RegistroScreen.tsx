import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface TimeRecord {
  id: string;
  periodo: string;
  horas_previstas?: string;
  horas_trabalhadas?: string;
  saldo_banco?: string;
  banco_horas_acumulado?: string;
  banco_horas_positivo?: string;
  adicional_noturno?: string;
  ferias_dias?: number;
  afastamentos_dias?: number;
}

interface OvertimeRecord {
  id: string;
  date: string;
  hours?: number;
  type?: string;
  approved?: boolean;
  periodo?: string;
  reason?: string;
}

interface Warning {
  id: string;
  date: string;
  level?: string;
  description?: string;
  score_impact?: number;
}

interface TipsRecord {
  id: string;
  periodo: string;
  valor_ponto?: number;
  total_pontos?: number;
  pontos_liquidos?: number;
}

interface TransportVoucher {
  id: string;
  periodo: string;
  dias_uteis?: number;
  valor_diario?: number | string;
  desconto_funcionario?: number | string;
  valor_empresa?: number | string;
}

interface Absence {
  id: string;
  date: string;
  type?: string;
  reason?: string;
  score_impact?: number;
  atestado_path?: string;
}

interface PunchRecord {
  tipo: string;
  timestamp_punch: string;
}

export default function RegistroScreen({ navigation }: any) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRecord[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [tips, setTips] = useState<TipsRecord[]>([]);
  const [transport, setTransport] = useState<TransportVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [lastPunch, setLastPunch] = useState<PunchRecord | null>(null);
  const [punchLoading, setPunchLoading] = useState(false);
  const [punchSuccess, setPunchSuccess] = useState(false);
  const [punchStep, setPunchStep] = useState<'idle' | 'gps' | 'camera' | 'upload' | 'done'>('idle');
  const punchScale = useRef(new Animated.Value(1)).current;
  const punchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // W1: limpa timer do punchSuccess no unmount
  useEffect(() => {
    return () => {
      if (punchTimerRef.current) clearTimeout(punchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        setLoading(false);
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

  async function fetchLastPunch(empId: string) {
    const { data } = await supabase.rpc('get_my_last_punch', { p_employee_id: empId });
    setLastPunch(data ?? null);
  }

  async function registrarPonto() {
    if (!employeeId || punchLoading) return;
    const proximoTipo = lastPunch?.tipo === 'entrada' ? 'saida' : 'entrada';
    setPunchLoading(true);
    setPunchStep('gps');

    Animated.sequence([
      Animated.timing(punchScale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(punchScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    try {
      // 1. Localização
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Localização necessária', 'Permita o acesso à localização para registrar o ponto.');
        return;
      }
      // TODO: geofencing Haversine (validar raio por unidade — Sprint E)
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('GPS lento. Tente em local aberto ou aguarde alguns segundos.')),
            10000
          )
        ),
      ]);

      // 2. Câmera frontal
      setPunchStep('camera');
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== 'granted') {
        Alert.alert('Câmera necessária', 'Permita o acesso à câmera para tirar a selfie do ponto.');
        return;
      }
      const photo = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.6,
        mediaTypes: 'images' as any,
      });
      if (photo.canceled || !photo.assets?.length) return;

      // 3. Upload da selfie — fetch→blob evita OOM em dispositivos com pouca RAM
      setPunchStep('upload');
      const asset = photo.assets[0]!;
      const ts = Date.now();
      const storagePath = `${employeeId}/${ts}_${proximoTipo}.jpg`;
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      const { error: storageError } = await supabase.storage
        .from('punch-photos')
        .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
      if (storageError) {
        Alert.alert('Erro no envio', 'Não foi possível enviar a selfie. Tente novamente.');
        return;
      }

      // 4. Registra o ponto
      const now = new Date().toISOString();
      const { data, error } = await supabase.rpc('insert_punch', {
        p_employee_id: employeeId,
        p_tipo:        proximoTipo,
        p_timestamp:   now,
        p_latitude:    location.coords.latitude,
        p_longitude:   location.coords.longitude,
        p_device_info: storagePath,
      });

      if (error || !data) {
        Alert.alert('Erro ao registrar ponto', error?.message ?? 'Tente novamente.');
        return;
      }

      // Sucesso — haptic + animação
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPunchStep('done');
      setLastPunch(data as PunchRecord);
      setPunchSuccess(true);
      punchTimerRef.current = setTimeout(() => setPunchSuccess(false), 3000);
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const isNetworkError = e instanceof TypeError && e.message?.includes('Network request failed');
      Alert.alert(
        isNetworkError ? 'Sem conexão' : 'Erro ao registrar ponto',
        isNetworkError ? 'Verifique sua internet e tente novamente.' : (e?.message ?? 'Tente novamente.')
      );
    } finally {
      setPunchLoading(false);
      setPunchStep('idle');
    }
  }

  const STEP_LABELS: Record<string, string> = {
    gps: 'Localizando...',
    camera: 'Abrindo câmera...',
    upload: 'Enviando selfie...',
    done: 'Registrado!',
  };

  function renderPontoCard() {
    const proximoTipo = lastPunch?.tipo === 'entrada' ? 'saida' : 'entrada';
    const isEntrada = proximoTipo === 'entrada';
    const cor = isEntrada ? COLORS.PRIMARY : COLORS.CARVAO;
    const label = isEntrada ? 'Registrar Entrada' : 'Registrar Saída';
    const iconName = isEntrada ? 'log-in-outline' : 'log-out-outline';

    let lastTime: string | null = null;
    if (lastPunch) {
      lastTime = new Date(lastPunch.timestamp_punch).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
    }

    return (
      <View style={[styles.card, styles.pontoCard]}>
        <Text style={styles.pontoTitle}>Bater Ponto</Text>

        {punchSuccess ? (
          <View style={styles.pontoSuccess}>
            <Ionicons name="checkmark-circle" size={30} color={COLORS.SUCCESS} />
            <Text style={styles.pontoSuccessText}>
              {lastPunch?.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada às{' '}
              {lastTime}
            </Text>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: punchScale }] }}>
            <TouchableOpacity
              style={[styles.pontoButton, { backgroundColor: cor }]}
              onPress={registrarPonto}
              disabled={punchLoading}
              activeOpacity={0.85}
              accessibilityLabel={isEntrada ? 'Registrar entrada' : 'Registrar saída'}
              accessibilityRole="button"
              accessibilityState={{ busy: punchLoading }}
            >
              {punchLoading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.pontoButtonText}>{STEP_LABELS[punchStep] ?? 'Processando...'}</Text>
                </>
              ) : (
                <>
                  <Ionicons name={iconName as any} size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.pontoButtonText}>{label}</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={styles.pontoSubtext} accessibilityLiveRegion="polite">
          {lastPunch && !punchSuccess
            ? `Último registro: ${lastPunch.tipo === 'entrada' ? 'entrada' : 'saída'} às ${lastTime}`
            : !punchSuccess
            ? 'Você ainda não bateu ponto hoje'
            : ''}
        </Text>
      </View>
    );
  }

  async function fetchAll() {
    if (!employeeId) return;

    const [registroRes] = await Promise.allSettled([
      supabase.rpc('get_my_registro', { p_employee_id: employeeId }),
      fetchLastPunch(employeeId),
    ]);

    if (registroRes.status === 'fulfilled' && registroRes.value.data) {
      const d = registroRes.value.data;
      setTimeRecords(d.time_records || []);
      setOvertime(d.overtime || []);
      setAbsences(d.absences || []);
      setWarnings(d.warnings || []);
      setTips(d.tips || []);
      setTransport(d.transport || []);
    }
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [employeeId]);

  type SectionData = { title: string; data: any[]; type: string };

  const sections: SectionData[] = [
    { title: 'Registro de Ponto', data: timeRecords, type: 'time' },
    { title: 'Horas Extras', data: overtime, type: 'overtime' },
    { title: 'Ausências', data: absences, type: 'absence' },
    { title: 'Gorjetas', data: tips, type: 'tips' },
    { title: 'Vale Transporte', data: transport, type: 'transport' },
    { title: 'Advertências', data: warnings, type: 'warning' },
  ];

  function renderTimeCard(item: TimeRecord) {
    const saldoPositivo = item.saldo_banco && !item.saldo_banco.startsWith('-');
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Previstas</Text>
          <Text style={styles.cardValue}>{item.horas_previstas || '—'}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Trabalhadas</Text>
          <Text style={styles.cardValue}>{item.horas_trabalhadas || '—'}</Text>
        </View>

        {item.saldo_banco && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Saldo banco</Text>
            <Text style={[styles.cardValue, { color: saldoPositivo ? COLORS.SUCCESS_TEXT : COLORS.ERROR_TEXT }]}>
              {item.saldo_banco}
            </Text>
          </View>
        )}

        {item.banco_horas_acumulado && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Banco acumulado</Text>
            <Text style={styles.cardValueSmall}>{item.banco_horas_acumulado}</Text>
          </View>
        )}

        {item.adicional_noturno && item.adicional_noturno !== '00:00' && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Adicional noturno</Text>
            <Text style={styles.cardValueSmall}>{item.adicional_noturno}</Text>
          </View>
        )}

        {(item.ferias_dias != null && item.ferias_dias > 0) || (item.afastamentos_dias != null && item.afastamentos_dias > 0) ? (
          <View style={[styles.cardRow, { marginTop: 4 }]}>
            {item.ferias_dias != null && item.ferias_dias > 0 && (
              <Text style={styles.cardMeta}>Férias: {item.ferias_dias} dias</Text>
            )}
            {item.afastamentos_dias != null && item.afastamentos_dias > 0 && (
              <Text style={styles.cardMeta}>Afastamentos: {item.afastamentos_dias}d</Text>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  function renderOvertimeCard(item: OvertimeRecord) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          <Text style={[styles.badge, item.approved ? styles.badgeApproved : styles.badgePending]}>
            {item.approved ? '● Aprovado' : '● Pendente'}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Tipo: {item.type || '—'}</Text>
          <Text style={[styles.cardValue, { color: COLORS.SUCCESS_TEXT }]}>
            {item.hours != null ? `${item.hours}h` : '—'}
          </Text>
        </View>
        {item.reason && (
          <Text style={styles.cardMeta}>Motivo: {item.reason}</Text>
        )}
      </View>
    );
  }

  function renderAbsenceCard(item: Absence) {
    const isDanger = item.type?.toLowerCase().includes('injustificad');
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          {item.type && (
            <Text style={[styles.badge, isDanger ? styles.badgeDanger : styles.badgeNeutral]}>
              {item.type}
            </Text>
          )}
        </View>
        {item.reason && (
          <Text style={styles.cardMeta}>Motivo: {item.reason}</Text>
        )}
        {item.score_impact != null && item.score_impact !== 0 && (
          <Text style={[styles.cardMeta, { color: COLORS.ERROR_TEXT, fontWeight: '600' }]}>
            Impacto no score: {item.score_impact} pts
          </Text>
        )}
      </View>
    );
  }

  function formatCurrency(val?: number | string | null) {
    if (val == null) return '—';
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(n)) return '—';
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
  }

  function renderTipsCard(item: TipsRecord) {
    const total = (item.pontos_liquidos ?? item.total_pontos ?? 0) * (item.valor_ponto ?? 0);
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
        {item.valor_ponto != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor do ponto</Text>
            <Text style={styles.cardValue}>{formatCurrency(item.valor_ponto)}</Text>
          </View>
        )}
        {item.total_pontos != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Total de pontos</Text>
            <Text style={styles.cardValue}>{item.total_pontos}</Text>
          </View>
        )}
        {item.pontos_liquidos != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Pontos líquidos</Text>
            <Text style={styles.cardValue}>{item.pontos_liquidos}</Text>
          </View>
        )}
        <View style={[styles.cardRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }]}>
          <Text style={styles.cardLabel}>Total gorjeta</Text>
          <Text style={[styles.cardValue, { color: COLORS.SUCCESS_TEXT }]}>{formatCurrency(total)}</Text>
        </View>
      </View>
    );
  }

  function renderTransportCard(item: TransportVoucher) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardPeriod}>{formatPeriodo(item.periodo)}</Text>
        {item.dias_uteis != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Dias úteis</Text>
            <Text style={styles.cardValue}>{item.dias_uteis}</Text>
          </View>
        )}
        {item.valor_diario != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor diário</Text>
            <Text style={styles.cardValue}>{formatCurrency(item.valor_diario)}</Text>
          </View>
        )}
        {item.desconto_funcionario != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Desconto funcionário</Text>
            <Text style={[styles.cardValue, { color: COLORS.ERROR_TEXT }]}>{formatCurrency(item.desconto_funcionario)}</Text>
          </View>
        )}
        {item.valor_empresa != null && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Valor empresa</Text>
            <Text style={[styles.cardValue, { color: COLORS.SUCCESS_TEXT }]}>{formatCurrency(item.valor_empresa)}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderWarningCard(item: Warning) {
    const levelColors: Record<string, string> = {
      leve: '#F59E0B',
      moderada: '#F97316',
      grave: '#EF4444',
      escrita: '#F59E0B',
      verbal: '#94A3B8',
    };
    const level = item.level?.toLowerCase() || '';
    const color = levelColors[level] || COLORS.TEXT_SECONDARY;
    return (
      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: color }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardPeriod}>{formatDate(item.date)}</Text>
          {item.level && (
            <Text style={[styles.badge, { color, backgroundColor: color + '22' }]}>
              {item.level}
            </Text>
          )}
        </View>
        {item.description && (
          <Text style={styles.cardMeta}>{item.description}</Text>
        )}
      </View>
    );
  }

  function renderItem({ item, section }: { item: any; section: SectionData }) {
    if (section.type === 'time') return renderTimeCard(item);
    if (section.type === 'overtime') return renderOvertimeCard(item);
    if (section.type === 'absence') return renderAbsenceCard(item);
    if (section.type === 'tips') return renderTipsCard(item);
    if (section.type === 'transport') return renderTransportCard(item);
    if (section.type === 'warning') return renderWarningCard(item);
    return renderAbsenceCard(item);
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

  const hasData = timeRecords.length > 0 || overtime.length > 0 || absences.length > 0 || warnings.length > 0 || tips.length > 0 || transport.length > 0;

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.list}
      sections={sections.filter(s => s.data.length > 0)}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      ListHeaderComponent={() => renderPontoCard()}
      ListEmptyComponent={
        <View style={styles.emptyInner}>
          <Ionicons name="time-outline" size={64} color={COLORS.BORDER} />
          <Text style={styles.emptyTitle}>Bata seu primeiro ponto hoje</Text>
          <Text style={styles.emptySubtitle}>Seus registros de ponto, horas extras e ausências aparecem aqui.</Text>
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
    padding: 32,
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.TEXT,
    marginTop: 16,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: COLORS.CARD,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
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
    marginBottom: 8,
  },
  cardPeriod: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
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
  cardValueSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeApproved: {
    color: COLORS.SUCCESS_TEXT,
    backgroundColor: '#DCFCE7',
  },
  badgePending: {
    color: '#92400E',
    backgroundColor: '#FEF3C7',
  },
  badgeDanger: {
    color: COLORS.ERROR_TEXT,
    backgroundColor: '#FEE2E2',
  },
  badgeNeutral: {
    color: COLORS.TEXT_SECONDARY,
    backgroundColor: COLORS.BACKGROUND,
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
  pontoCard: {
    marginBottom: 16,
  },
  pontoTitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  pontoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minHeight: 52,
  },
  pontoButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
  },
  pontoSubtext: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
    marginTop: 10,
    textAlign: 'center',
  },
  pontoSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  pontoSuccessText: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.SUCCESS_TEXT,
  },
  emptyInner: {
    alignItems: 'center',
    padding: 32,
    marginTop: 8,
  },
});
