import { useEffect, useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { getSession, logout } from '../lib/auth';
import { COLORS, RADIUS, SHADOW, Employee } from '../lib/types';
import { PontoHeroCard, derivePontoState } from '../components/PontoHeroCard';

const MESES: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

interface PodiumEmployee {
  id: string;
  nome: string;
  sobrenome?: string;
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
  todayPunches: LastPunch[];
  ultimaCampanha: { title: string; category: string } | null;
}

export default function HomeScreen({ navigation }: any) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>({
    score: null, rankPosition: null, bancoHoras: null, faltasMes: 0,
    todayPunches: [], ultimaCampanha: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [podium, setPodium] = useState<PodiumEmployee[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

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
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [scoreResult, bancoResult, faltasResult, podiumResult, punchResult, campanhaResult] =
      await Promise.allSettled([
        supabase.from('employees').select('score, photo_url').eq('id', empId).single(),
        supabase.from('time_records').select('saldo_banco, banco_horas_acumulado').eq('employee_id', empId).order('periodo', { ascending: false }).limit(1).single(),
        supabase.from('absences').select('id', { count: 'exact', head: true }).eq('employee_id', empId).gte('date', firstOfMonth),
        supabase.from('employees').select('id, nome, sobrenome, photo_url, score').not('score', 'is', null).order('score', { ascending: false }).limit(10),
        supabase.rpc('get_my_punches_today', { p_employee_id: empId }),
        supabase.from('campaigns').select('title, category').eq('active', true).order('created_at', { ascending: false }).limit(1).single(),
      ]);

    const scoreRes    = scoreResult.status    === 'fulfilled' ? scoreResult.value    : null;
    const bancoRes    = bancoResult.status    === 'fulfilled' ? bancoResult.value    : null;
    const faltasRes   = faltasResult.status   === 'fulfilled' ? faltasResult.value   : null;
    const podiumRes   = podiumResult.status   === 'fulfilled' ? podiumResult.value   : null;
    const punchRes    = punchResult.status    === 'fulfilled' ? punchResult.value    : null;
    const campanhaRes = campanhaResult.status === 'fulfilled' ? campanhaResult.value : null;

    if (scoreRes?.data?.photo_url) setPhotoUrl(scoreRes.data.photo_url);

    const allScores: PodiumEmployee[] = podiumRes?.data || [];
    const myScore = scoreRes?.data?.score ?? null;
    let rankPosition: number | null = null;
    if (myScore != null && allScores.length > 0) {
      const higher = allScores.map(e => e.score).filter(s => s > myScore).length;
      rankPosition = higher + 1;
    }

    setPodium(allScores.slice(0, 3));

    setDashboard({
      score: myScore,
      rankPosition,
      bancoHoras: bancoRes?.data || null,
      faltasMes: faltasRes?.count || 0,
      todayPunches: (punchRes?.data as LastPunch[]) ?? [],
      ultimaCampanha: campanhaRes?.data ?? null,
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
      } catch {
        Alert.alert('Erro', 'Não foi possível atualizar a foto. Tente novamente.');
      } finally {
        setUploadingPhoto(false);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Tirar foto', 'Escolher da galeria', 'Cancelar'], cancelButtonIndex: 2 },
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
    const podiumColors = { 1: '#B8975A', 2: COLORS.gray400, 3: '#A0522D' } as const;
    const heights = { 1: 80, 2: 60, 3: 48 };
    const medals = { 1: '1°', 2: '2°', 3: '3°' };
    const initials = (emp.nome?.[0] || '') + (emp.sobrenome?.[0] || '');
    const c = podiumColors[position];
    return (
      <View style={[styles.podiumCard, isFirst && styles.podiumCardFirst]}>
        <Text style={[styles.podiumMedal, { color: c }]}>{medals[position]}</Text>
        {emp.photo_url ? (
          <Image
            source={{ uri: emp.photo_url }}
            style={[styles.podiumAvatar, {
              borderColor: c,
              width: isFirst ? 60 : 48,
              height: isFirst ? 60 : 48,
              borderRadius: isFirst ? 30 : 24,
            }]}
          />
        ) : (
          <View style={[styles.podiumAvatarPlaceholder, {
            backgroundColor: c + '33',
            borderColor: c,
            width: isFirst ? 60 : 48,
            height: isFirst ? 60 : 48,
            borderRadius: isFirst ? 30 : 24,
          }]}>
            <Text style={[styles.podiumInitials, { fontSize: isFirst ? 18 : 14 }]}>
              {(initials || '?').toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={[styles.podiumName, isFirst && { fontSize: 13, fontFamily: 'InstrumentSans_600SemiBold' }]} numberOfLines={1}>
          {emp.nome}
        </Text>
        <View style={[styles.podiumScoreBadge, { borderColor: c + '66' }]}>
          <Text style={[styles.podiumScore, { color: c }]}>⭐ {emp.score}</Text>
        </View>
        <View style={[styles.podiumBase, { height: heights[position], backgroundColor: c + '18', borderTopColor: c }]}>
          <Text style={[styles.podiumPosition, { color: c }]}>{position}</Text>
        </View>
      </View>
    );
  }

  const saldoPositivo = dashboard.bancoHoras?.saldo_banco && !dashboard.bancoHoras.saldo_banco.startsWith('-');
  const primeiroNome = employee?.nome?.split(' ')[0] || 'Colaborador';
  const todayPunches = dashboard.todayPunches;
  const firstEntrada = todayPunches.find(p => p.tipo === 'entrada') ?? null;
  const pontoState = derivePontoState(todayPunches);

  const CATEGORY_LABELS: Record<string, string> = {
    saude: 'Saúde', evento: 'Evento', comunicado: 'Comunicado',
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* ── Header colorido ─────────────────────────────────────────────── */}
      <View style={styles.header}>
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
            >
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(employee?.nome)}</Text>
                </View>
              )}
              <View style={styles.avatarEdit}>
                <Ionicons name="camera" size={9} color={COLORS.textInverse} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutButton}
              accessibilityLabel="Sair da conta"
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <View style={styles.content}>
        {/* Card de ponto — herói */}
        <PontoHeroCard
          pontoState={pontoState}
          todayPunches={todayPunches}
          firstEntrada={firstEntrada}
          onAction={() => navigation.navigate('Registro')}
        />

        {/* Métricas */}
        <View style={styles.metricsRow}>
          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => navigation.navigate('Registro')}
            accessibilityLabel={`Banco de horas: ${dashboard.bancoHoras?.saldo_banco || 'sem dados'}`}
            accessibilityRole="button"
          >
            <Text style={styles.metricIcon}>⏱</Text>
            <Text style={styles.metricLabel}>Banco</Text>
            <Text style={[styles.metricValor, saldoPositivo ? { color: COLORS.success } : dashboard.bancoHoras?.saldo_banco ? { color: COLORS.error } : {}]}>
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
            <Text style={[styles.metricValor, dashboard.faltasMes > 0 ? { color: COLORS.error } : { color: COLORS.success }]}>
              {dashboard.faltasMes}
            </Text>
          </TouchableOpacity>

          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🏅</Text>
            <Text style={styles.metricLabel}>Ranking</Text>
            <Text style={[styles.metricValor, { color: '#B8975A' }]}>
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
              accessibilityRole="button"
            >
              <View style={styles.campanhaLeft}>
                <View style={styles.campanhaDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.campanhaCategoria}>
                    {CATEGORY_LABELS[dashboard.ultimaCampanha.category] || dashboard.ultimaCampanha.category}
                  </Text>
                  <Text style={styles.campanhaTitulo} numberOfLines={2}>
                    {dashboard.ultimaCampanha.title}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </>
        )}

        {/* Perfil */}
        <Text style={styles.sectionTitle}>Seu perfil</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Departamento" value={employee?.departamento || '—'} />
          <InfoRow label="Admissão" value={employee?.data_admissao ? new Date(employee.data_admissao).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow label="Status" value={employee?.status ? employee.status.charAt(0).toUpperCase() + employee.status.slice(1) : '—'} last />
        </View>
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
    backgroundColor: COLORS.background,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  saudacao: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  nomeHeader: {
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textInverse,
    marginTop: 2,
    letterSpacing: -0.3,
  },
  cargoHeader: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 12,
  },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  avatarInitials: {
    fontSize: 18,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.primary,
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.black,
    borderRadius: 7,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.md,
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Conteúdo ──────────────────────────────────────────────────────────────
  content: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 48,
  },

  // ── Card de ponto ─────────────────────────────────────────────────────────
  pontoCard: {
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    ...SHADOW.sm,
  },
  pontoCardActive: {
    backgroundColor: COLORS.successLight,
    borderColor: '#A7D9C3',
  },
  pontoCardIdle: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  pontoCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pontoCardLabel: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.textSecondary,
  },
  pontoCardValor: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_600SemiBold',
    marginTop: 1,
  },
  pontoCTA: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 9,
    paddingHorizontal: 20,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  pontoCTAText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textInverse,
  },

  // ── Métricas ──────────────────────────────────────────────────────────────
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  metricIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  metricValor: {
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },

  // ── Pódio ─────────────────────────────────────────────────────────────────
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 8,
  },
  podiumCard: { alignItems: 'center', flex: 1 },
  podiumCardFirst: { marginBottom: 12 },
  podiumMedal: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  podiumAvatar: { borderWidth: 2, marginBottom: 6 },
  podiumAvatarPlaceholder: {
    borderWidth: 2,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumInitials: { fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textInverse },
  podiumName: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  podiumScoreBadge: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 6,
  },
  podiumScore: { fontSize: 10, fontFamily: 'InstrumentSans_600SemiBold' },
  podiumBase: {
    width: '100%',
    borderTopWidth: 2,
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  podiumPosition: { fontSize: 20, fontFamily: 'Fraunces_700Bold' },

  // ── Campanha ──────────────────────────────────────────────────────────────
  campanhaCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    ...SHADOW.sm,
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
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  campanhaCategoria: {
    fontSize: 11,
    fontFamily: 'InstrumentSans_500Medium',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  campanhaTitulo: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textPrimary,
  },

  // ── Títulos de seção ──────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },

  // ── Card de perfil ────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    ...SHADOW.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textPrimary,
  },
});

