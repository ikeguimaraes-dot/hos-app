import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { getSession, logout } from '../lib/auth';
import { COLORS, Employee } from '../lib/types';

const MESES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function formatPeriodo(periodo: string): string {
  if (!periodo) return '—';
  const [ano, mes] = periodo.split('-');
  return `${MESES[mes] || mes}/${ano}`;
}

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '—';
  }
}

interface PodiumEmployee {
  id: string;
  full_name: string;
  photo_url?: string;
  score: number;
}

interface LastPunch {
  tipo: 'entrada' | 'saida';
  timestamp_punch: string;
}

interface DashboardData {
  score: number | null;
  rankPosition: number | null;
  bancoHoras: { saldo_banco: string; banco_horas_acumulado: string } | null;
  faltasMes: number;
  lastPunch: LastPunch | null;
  ultimaCampanha: { title: string; category: string } | null;
}

export default function HomeScreen({ navigation }: any) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>({
    score: null, rankPosition: null, bancoHoras: null, faltasMes: 0,
    lastPunch: null, ultimaCampanha: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [podium, setPodium] = useState<PodiumEmployee[]>([]);
  const [allEmployeeScores, setAllEmployeeScores] = useState<string[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const session = await getSession();
    if (!session) {
      Alert.alert('Sessão expirada', 'Faça login novamente.', [
        { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
      ]);
      return;
    }
    setEmployee(session.employee);
    await fetchDashboard(session.employee.id);
  }

  async function fetchDashboard(empId: string) {
    const now = new Date();
    const hoje = now.toISOString().split('T')[0];
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [scoreResult, bancoResult, faltasResult, podiumResult, punchResult, campanhaResult] =
      await Promise.allSettled([
        supabase.from('employees').select('score, photo_url').eq('id', empId).single(),
        supabase.from('time_records').select('saldo_banco, banco_horas_acumulado').eq('employee_id', empId).order('periodo', { ascending: false }).limit(1).single(),
        supabase.from('absences').select('id', { count: 'exact', head: true }).eq('employee_id', empId).gte('date', firstOfMonth),
        supabase.from('employees').select('id, full_name, photo_url, score').not('score', 'is', null).order('score', { ascending: false }).limit(10),
        supabase.from('time_clock_punches').select('tipo, timestamp_punch').eq('employee_id', empId).gte('timestamp_punch', `${hoje}T00:00:00`).order('timestamp_punch', { ascending: false }).limit(1).single(),
        supabase.from('campaigns').select('title, category').eq('active', true).order('created_at', { ascending: false }).limit(1).single(),
      ]);

    const scoreRes    = scoreResult.status    === 'fulfilled' ? scoreResult.value    : null;
    const bancoRes    = bancoResult.status    === 'fulfilled' ? bancoResult.value    : null;
    const faltasRes   = faltasResult.status   === 'fulfilled' ? faltasResult.value   : null;
    const podiumRes   = podiumResult.status   === 'fulfilled' ? podiumResult.value   : null;
    const punchRes    = punchResult.status    === 'fulfilled' ? punchResult.value    : null;
    const campanhaRes = campanhaResult.status === 'fulfilled' ? campanhaResult.value : null;

    if (scoreRes?.data?.photo_url) setPhotoUrl(scoreRes.data.photo_url);

    // Rank position: count how many employees have score > this employee's score
    const allScores: PodiumEmployee[] = podiumRes?.data || [];
    const myScore = scoreRes?.data?.score ?? null;
    let rankPosition: number | null = null;
    if (myScore != null && allScores.length > 0) {
      const scoreValues = allScores.map(e => e.score);
      setAllEmployeeScores(scoreValues.map(String));
      const higher = scoreValues.filter(s => s > myScore).length;
      rankPosition = higher + 1;
    }

    setPodium(allScores.slice(0, 3));

    setDashboard({
      score: myScore,
      rankPosition,
      bancoHoras: bancoRes?.data || null,
      faltasMes: faltasRes?.count || 0,
      lastPunch: (punchRes?.data && punchRes.error?.code !== 'PGRST116') ? punchRes.data : null,
      ultimaCampanha: (campanhaRes?.data && campanhaRes.error?.code !== 'PGRST116') ? campanhaRes.data : null,
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza que quer encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  }

  async function handleChangePhoto() {
    const options = ['Tirar foto', 'Escolher da galeria', 'Cancelar'];
    const pick = async (useCamera: boolean) => {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso nas configurações do celular.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled || !result.assets?.length) return;
      const uri = result.assets[0].uri;
      setUploadingPhoto(true);
      try {
        const empId = employee?.id;
        if (!empId) return;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const path = `avatars/${empId}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, byteArray, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        const newUrl = urlData.publicUrl + '?t=' + Date.now();
        await supabase.from('employees').update({ photo_url: newUrl }).eq('id', empId);
        setPhotoUrl(newUrl);
      } catch (e: any) {
        Alert.alert('Erro', 'Não foi possível atualizar a foto. Tente novamente.');
      } finally {
        setUploadingPhoto(false);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (i) => { if (i === 0) pick(true); if (i === 1) pick(false); }
      );
    } else {
      Alert.alert('Foto de perfil', 'Escolha uma opção', [
        { text: 'Tirar foto', onPress: () => pick(true) },
        { text: 'Galeria', onPress: () => pick(false) },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  }

  function getInitials(name?: string) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function PodiumCard({ emp, position }: { emp: PodiumEmployee; position: 1 | 2 | 3 }) {
    const isFirst = position === 1;
    const colors = { 1: COLORS.OURO, 2: COLORS.PEDRA, 3: '#A0522D' };
    const heights = { 1: 80, 2: 60, 3: 48 };
    const medals = { 1: '1°', 2: '2°', 3: '3°' };
    const ini = emp.full_name?.trim().split(' ').filter(Boolean);
    const initials = ini?.length > 1
      ? ini[0][0] + ini[ini.length - 1][0]
      : (ini?.[0]?.[0] || '?');
    return (
      <View
        style={[styles.podiumCard, isFirst && styles.podiumCardFirst]}
        accessible
        accessibilityLabel={`${position}º lugar: ${emp.full_name}, ${emp.score} pontos`}
      >
        <Text style={[styles.podiumMedal, { color: colors[position] }]}>{medals[position]}</Text>
        {emp.photo_url ? (
          <Image
            source={{ uri: emp.photo_url }}
            style={[styles.podiumAvatar, {
              borderColor: colors[position],
              width: isFirst ? 60 : 48,
              height: isFirst ? 60 : 48,
              borderRadius: isFirst ? 30 : 24,
            }]}
            accessible={false}
          />
        ) : (
          <View style={[styles.podiumAvatarPlaceholder, {
            backgroundColor: colors[position] + '33',
            borderColor: colors[position],
            width: isFirst ? 60 : 48,
            height: isFirst ? 60 : 48,
            borderRadius: isFirst ? 30 : 24,
          }]} accessible={false}>
            <Text style={[styles.podiumInitials, { fontSize: isFirst ? 18 : 14 }]}>
              {initials.toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={[styles.podiumName, isFirst && { fontSize: 13, fontFamily: 'InstrumentSans_600SemiBold' }]} numberOfLines={1}>
          {emp.full_name?.split(' ')[0]}
        </Text>
        <View style={[styles.podiumScoreBadge, { borderColor: colors[position] + '66' }]}>
          <Text style={[styles.podiumScore, { color: colors[position] }]}>⭐ {emp.score}</Text>
        </View>
        <View style={[styles.podiumBase, { height: heights[position], backgroundColor: colors[position] + '18', borderTopColor: colors[position] }]}>
          <Text style={[styles.podiumPosition, { color: colors[position] }]}>{position}</Text>
        </View>
      </View>
    );
  }

  const saldoPositivo = dashboard.bancoHoras?.saldo_banco && !dashboard.bancoHoras.saldo_banco.startsWith('-');
  const primeiroNome = employee?.nome?.split(' ')[0] || 'Colaborador';
  const pontoDia = dashboard.lastPunch;
  const pontoHora = pontoDia ? formatTime(pontoDia.timestamp_punch) : null;
  const pontoBatido = pontoDia?.tipo === 'entrada';

  const CATEGORY_LABELS: Record<string, string> = {
    saude: 'Saúde', evento: 'Evento', comunicado: 'Comunicado',
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Header — saudação + avatar + logout */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.saudacao}>{getSaudacao()},</Text>
          <Text style={styles.nomeHeader} numberOfLines={1}>{primeiroNome}</Text>
          {employee?.cargo ? (
            <Text style={styles.cargoHeader} numberOfLines={1}>{employee.cargo}</Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploadingPhoto}
            style={styles.avatarContainer}
            accessibilityLabel="Alterar foto de perfil"
            accessibilityRole="button"
            accessibilityHint="Abre opções para tirar foto ou escolher da galeria"
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} accessible={false} />
            ) : (
              <View style={styles.avatarPlaceholder} accessible={false}>
                <Text style={styles.avatarInitials}>{getInitials(employee?.nome)}</Text>
              </View>
            )}
            <View style={styles.avatarEdit} accessible={false}>
              <Ionicons name="camera" size={9} color="#FFF" accessible={false} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutButton}
            accessibilityLabel="Sair da conta"
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.TEXT_SECONDARY} accessible={false} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Card de ponto */}
      <View style={[styles.pontoCard, pontoBatido ? styles.pontoCardActive : styles.pontoCardIdle]}>
        <View style={styles.pontoCardLeft}>
          <Ionicons
            name={pontoBatido ? 'checkmark-circle' : 'time-outline'}
            size={28}
            color={pontoBatido ? COLORS.SUCCESS_TEXT : COLORS.PRIMARY}
            accessible={false}
          />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.pontoCardLabel}>
              {pontoBatido ? 'Entrada registrada' : 'Ponto de hoje'}
            </Text>
            <Text style={[styles.pontoCardValor, pontoBatido ? { color: COLORS.SUCCESS_TEXT } : { color: COLORS.TEXT_SECONDARY }]}>
              {pontoBatido ? `${pontoHora}` : 'Você ainda não bateu ponto'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.pontoCTA}
          onPress={() => navigation.navigate('Registro')}
          accessibilityLabel={pontoBatido ? 'Ver registro de ponto' : 'Bater ponto agora'}
          accessibilityRole="button"
        >
          <Text style={styles.pontoCTAText}>{pontoBatido ? 'Ver' : 'Bater ponto'}</Text>
        </TouchableOpacity>
      </View>

      {/* 3 metric cards */}
      <View style={styles.metricsRow}>
        <TouchableOpacity
          style={styles.metricCard}
          onPress={() => navigation.navigate('Registro')}
          accessibilityLabel={`Banco de horas: ${dashboard.bancoHoras?.saldo_banco || 'sem dados'}`}
          accessibilityRole="button"
        >
          <Text style={styles.metricIcon}>⏱</Text>
          <Text style={styles.metricLabel}>Banco</Text>
          <Text style={[styles.metricValor, saldoPositivo ? { color: COLORS.SUCCESS_TEXT } : dashboard.bancoHoras?.saldo_banco ? { color: COLORS.ERROR_TEXT } : {}]}>
            {dashboard.bancoHoras?.saldo_banco || '—'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.metricCard}
          onPress={() => navigation.navigate('Registro')}
          accessibilityLabel={`Faltas no mês: ${dashboard.faltasMes}`}
          accessibilityRole="button"
        >
          <Text style={styles.metricIcon}>📅</Text>
          <Text style={styles.metricLabel}>Faltas</Text>
          <Text style={[styles.metricValor, dashboard.faltasMes > 0 ? { color: COLORS.ERROR_TEXT } : { color: COLORS.SUCCESS_TEXT }]}>
            {dashboard.faltasMes}
          </Text>
        </TouchableOpacity>

        <View
          style={styles.metricCard}
          accessible
          accessibilityLabel={`Posição no ranking: ${dashboard.rankPosition != null ? `${dashboard.rankPosition}º` : 'sem dados'}`}
        >
          <Text style={styles.metricIcon}>🏅</Text>
          <Text style={styles.metricLabel}>Ranking</Text>
          <Text style={[styles.metricValor, { color: COLORS.OURO }]}>
            {dashboard.rankPosition != null ? `${dashboard.rankPosition}º` : '—'}
          </Text>
        </View>
      </View>

      {/* Pódio */}
      {podium.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Ranking da equipe</Text>
          <View style={styles.podiumContainer}>
            {podium[1] && <PodiumCard emp={podium[1]} position={2} />}
            {podium[0] && <PodiumCard emp={podium[0]} position={1} />}
            {podium[2] && <PodiumCard emp={podium[2]} position={3} />}
          </View>
        </>
      )}

      {/* Comunicado recente */}
      {dashboard.ultimaCampanha && (
        <>
          <Text style={styles.sectionTitle}>Comunicados</Text>
          <TouchableOpacity
            style={styles.campanhaCard}
            onPress={() => navigation.navigate('Campanhas')}
            accessibilityLabel={`Campanha: ${dashboard.ultimaCampanha.title}. Toque para ver todas.`}
            accessibilityRole="button"
          >
            <View style={styles.campanhaLeft}>
              <View style={styles.campanhaDot} accessible={false} />
              <View style={{ flex: 1 }}>
                <Text style={styles.campanhaCategoria}>
                  {CATEGORY_LABELS[dashboard.ultimaCampanha.category] || dashboard.ultimaCampanha.category}
                </Text>
                <Text style={styles.campanhaTitulo} numberOfLines={2}>
                  {dashboard.ultimaCampanha.title}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.TEXT_SECONDARY} accessible={false} />
          </TouchableOpacity>
        </>
      )}

      {/* Info */}
      <Text style={styles.sectionTitle}>Seu perfil</Text>
      <View style={styles.infoCard}>
        <InfoRow label="Departamento" value={employee?.departamento || '—'} />
        <InfoRow label="Admissão" value={employee?.data_admissao || '—'} />
        <InfoRow label="Status" value={employee?.status || '—'} last />
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  saudacao: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
  },
  nomeHeader: {
    fontSize: 26,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.TEXT,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  cargoHeader: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.PRIMARY + '22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
  },
  avatarInitials: {
    fontSize: 18,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.PRIMARY,
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.CARVAO,
    borderRadius: 7,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.BACKGROUND,
  },
  logoutButton: {
    backgroundColor: COLORS.CARD,
    borderRadius: 12,
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },

  // Ponto card
  pontoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  pontoCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  pontoCardIdle: {
    backgroundColor: COLORS.CARD,
    borderColor: COLORS.BORDER,
  },
  pontoCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pontoCardLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.TEXT_SECONDARY,
  },
  pontoCardValor: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_600SemiBold',
    marginTop: 1,
  },
  pontoCTA: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  pontoCTAText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: '#FFF',
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  metricIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  metricValor: {
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.TEXT,
    textAlign: 'center',
  },

  // Podium
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 8,
  },
  podiumCard: {
    alignItems: 'center',
    flex: 1,
  },
  podiumCardFirst: {
    marginBottom: 12,
  },
  podiumMedal: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_700Bold' as any,
    marginBottom: 6,
    fontWeight: '800',
  },
  podiumAvatar: {
    borderWidth: 2,
    marginBottom: 6,
  },
  podiumAvatarPlaceholder: {
    borderWidth: 2,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumInitials: {
    fontFamily: 'InstrumentSans_600SemiBold',
    color: '#FFF',
  },
  podiumName: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.TEXT,
    marginBottom: 4,
    textAlign: 'center',
  },
  podiumScoreBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 6,
  },
  podiumScore: {
    fontSize: 10,
    fontFamily: 'InstrumentSans_600SemiBold',
  },
  podiumBase: {
    width: '100%',
    borderTopWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  podiumPosition: {
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
  },

  // Campanha
  campanhaCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  campanhaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  campanhaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.PRIMARY,
  },
  campanhaCategoria: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  campanhaTitulo: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.TEXT,
  },

  // Section titles
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.TEXT,
    marginBottom: 12,
    letterSpacing: -0.3,
  },

  // Info
  infoCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.TEXT,
  },
});
