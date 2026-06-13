import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS } from '../lib/types';
import { PontoHeroCard, derivePontoState } from '../components/PontoHeroCard';

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

interface TodayPunch {
  id: string;
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

  const [todayPunches, setTodayPunches] = useState<TodayPunch[]>([]);
  const [punchLoading, setPunchLoading] = useState(false);
  const [punchStep, setPunchStep] = useState<'idle' | 'gps' | 'camera' | 'upload' | 'done'>('idle');
  const punchScale = useRef(new Animated.Value(1)).current;

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

  useFocusEffect(
    useCallback(() => {
      if (employeeId) fetchTodayPunches(employeeId);
    }, [employeeId])
  );

  async function fetchTodayPunches(empId: string) {
    const { data } = await supabase.rpc('get_my_punches_today', { p_employee_id: empId });
    setTodayPunches(data || []);
  }

  async function registrarPonto() {
    if (!employeeId || punchLoading) return;
    const proximoTipo: 'entrada' | 'saida' = pontoState === 'working' ? 'saida' : 'entrada';
    setPunchLoading(true);
    setPunchStep('gps');

    Animated.sequence([
      Animated.timing(punchScale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(punchScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    try {
      // 1. Localização — estratégia em camadas (GPS não bloqueia o registro)
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Localização necessária', 'Permita o acesso à localização para registrar o ponto.');
        return;
      }
      // TODO: geofencing Haversine (validar raio por unidade — Sprint E)
      let coords: { latitude: number; longitude: number } | null = null;
      let gpsWarning = false;
      try {
        // Camada 1: última posição conhecida do sistema (instantânea, sem aguardar sinal)
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        if (lastKnown) {
          coords = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
        } else {
          // Camada 2: posição atual com precisão balanceada e timeout de 10s
          const current = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 0 }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('GPS_TIMEOUT')), 10000)
            ),
          ]);
          coords = { latitude: current.coords.latitude, longitude: current.coords.longitude };
        }
      } catch {
        // Camada 3: registrar sem coordenadas — localização é metadado, não bloqueio
        gpsWarning = true;
      }

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

      // 3. Upload da selfie — base64 via FileSystem funciona em content:// e file:// (Android + iOS)
      setPunchStep('upload');
      const asset = photo.assets[0]!;
      const ts = Date.now();
      const storagePath = `${employeeId}/${ts}_${proximoTipo}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const { error: storageError } = await supabase.storage
        .from('punch-photos')
        .upload(storagePath, byteArray, { contentType: 'image/jpeg', upsert: false });
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
        p_latitude:    coords?.latitude ?? null,
        p_longitude:   coords?.longitude ?? null,
        p_device_info: storagePath,
      });

      if (error || !data) {
        Alert.alert('Erro ao registrar ponto', error?.message ?? 'Tente novamente.');
        return;
      }

      // Sucesso — haptic + refetch
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPunchStep('done');
      fetchTodayPunches(employeeId);
      if (gpsWarning) {
        Alert.alert(
          'Ponto registrado',
          'Localização não capturada — pode ser solicitada validação do gestor.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
        );
      } else {
        setTimeout(() => navigation.navigate('Home'), 1500);
      }
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

  const pontoState = derivePontoState(todayPunches);
  const todayFirstEntrada = todayPunches.find(p => p.tipo === 'entrada') ?? null;

  async function fetchAll() {
    if (!employeeId) return;

    const [registroRes] = await Promise.allSettled([
      supabase.rpc('get_my_registro', { p_employee_id: employeeId }),
      fetchTodayPunches(employeeId),
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

  function calcTotalHoras(punches: TodayPunch[]): string {
    let total = 0;
    for (let i = 0; i + 1 < punches.length; i += 2) {
      const entrada = new Date(punches[i].timestamp_punch).getTime();
      const saida   = new Date(punches[i + 1].timestamp_punch).getTime();
      if (punches[i].tipo === 'entrada' && punches[i + 1].tipo === 'saida') {
        total += saida - entrada;
      }
    }
    if (total === 0) return '';
    const horas   = Math.floor(total / 3600000);
    const minutos = Math.floor((total % 3600000) / 60000);
    return `${horas}h${minutos.toString().padStart(2, '0')}`;
  }

  function renderTimelineCard() {
    const fmt = (ts: string) =>
      new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const total = calcTotalHoras(todayPunches);

    return (
      <View style={[styles.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={styles.pontoTitle}>Pontos de hoje</Text>
          {total ? (
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>{total} trabalhadas</Text>
            </View>
          ) : null}
        </View>

        {todayPunches.length === 0 ? (
          <Text style={styles.timelineEmpty}>Nenhum ponto registrado hoje</Text>
        ) : (
          <View style={styles.timelineRow}>
            {todayPunches.map((p, idx) => (
              <View key={p.id} style={styles.timelineItem}>
                {idx > 0 && <View style={styles.timelineDash} />}
                <View style={[styles.timelineDot, p.tipo === 'entrada' ? styles.dotEntrada : styles.dotSaida]} />
                <Text style={styles.timelineLabel}>{p.tipo === 'entrada' ? 'Entrada' : 'Saída'}</Text>
                <Text style={styles.timelineHora}>{fmt(p.timestamp_punch)}</Text>
              </View>
            ))}
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

  const hasData = timeRecords.length > 0 || overtime.length > 0 || absences.length > 0 || warnings.length > 0 || tips.length > 0 || transport.length > 0;

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.list}
      sections={sections.filter(s => s.data.length > 0)}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      ListHeaderComponent={() => (
        <>
          <Animated.View style={{ transform: [{ scale: punchScale }] }}>
            <PontoHeroCard
              pontoState={pontoState}
              todayPunches={todayPunches}
              firstEntrada={todayFirstEntrada}
              onAction={registrarPonto}
              actionLoading={punchLoading}
              actionLoadingLabel={STEP_LABELS[punchStep] ?? 'Processando...'}
            />
          </Animated.View>
          {renderTimelineCard()}
        </>
      )}
      ListEmptyComponent={
        pontoState === 'idle' ? (
          <View style={styles.emptyInner}>
            <Ionicons name="time-outline" size={64} color={COLORS.BORDER} />
            <Text style={styles.emptyTitle}>Bata seu primeiro ponto hoje</Text>
            <Text style={styles.emptySubtitle}>Seus registros de ponto, horas extras e ausências aparecem aqui.</Text>
          </View>
        ) : null
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

  // Timeline do dia
  timelineRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  timelineItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDash:  { width: 16, height: 1, backgroundColor: COLORS.BORDER, marginHorizontal: 2 },
  timelineDot:   { width: 8, height: 8, borderRadius: 4 },
  dotEntrada:    { backgroundColor: COLORS.SUCCESS_TEXT },
  dotSaida:      { backgroundColor: COLORS.ERROR_TEXT },
  timelineLabel: { fontSize: 12, color: COLORS.TEXT_SECONDARY, fontFamily: 'InstrumentSans_400Regular' },
  timelineHora:  { fontSize: 13, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.TEXT, marginLeft: 2 },
  timelineEmpty: { fontSize: 14, color: COLORS.TEXT_SECONDARY, fontStyle: 'italic' },
  totalBadge:    { backgroundColor: COLORS.SUCCESS_TEXT + '22', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  totalBadgeText:{ fontSize: 12, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.SUCCESS_TEXT },
});
