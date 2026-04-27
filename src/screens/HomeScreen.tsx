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
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function formatPeriodo(periodo: string): string {
  if (!periodo) return '—';
  const [ano, mes] = periodo.split('-');
  return `${MESES[mes] || mes} ${ano}`;
}

function formatCurrency(value?: number | null): string {
  if (value == null) return '—';
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

interface PodiumEmployee {
  id: string;
  full_name: string;
  photo_url?: string;
  score: number;

}

interface DashboardData {
  score: number | null;
  ultimoHolerite: { periodo: string; valor_liquido: number } | null;
  bancoHoras: { saldo_banco: string; banco_horas_acumulado: string } | null;
  faltasMes: number;
}

export default function HomeScreen({ navigation }: any) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>({
    score: null, ultimoHolerite: null, bancoHoras: null, faltasMes: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [podium, setPodium] = useState<PodiumEmployee[]>([]);

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
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [scoreRes, holeriteRes, bancoRes, faltasRes, podiumRes] = await Promise.all([
      supabase.from('employees').select('score, photo_url').eq('id', empId).single(),
      supabase.from('payslips').select('periodo, valor_liquido').eq('employee_id', empId).order('periodo', { ascending: false }).limit(1).single(),
      supabase.from('time_records').select('saldo_banco, banco_horas_acumulado').eq('employee_id', empId).order('periodo', { ascending: false }).limit(1).single(),
      supabase.from('absences').select('id', { count: 'exact', head: true }).eq('employee_id', empId).gte('date', firstOfMonth),
      supabase.from('employees').select('id, full_name, photo_url, score').not('score', 'is', null).order('score', { ascending: false }).limit(3),
    ]);

    if (scoreRes.error) console.error('[HOME] score error:', scoreRes.error);
    if (scoreRes.data?.photo_url) setPhotoUrl(scoreRes.data.photo_url);
    if (holeriteRes.error && holeriteRes.error.code !== 'PGRST116') console.error('[HOME] holerite error:', holeriteRes.error);
    if (bancoRes.error && bancoRes.error.code !== 'PGRST116') console.error('[HOME] banco error:', bancoRes.error);
    if (faltasRes.error) console.error('[HOME] faltas error:', faltasRes.error);
    console.log('[PODIUM] data:', JSON.stringify(podiumRes.data));
    console.log('[PODIUM] error:', JSON.stringify(podiumRes.error));
    if (podiumRes.data) setPodium(podiumRes.data);

    setDashboard({
      score: scoreRes.data?.score ?? null,
      ultimoHolerite: holeriteRes.data || null,
      bancoHoras: bancoRes.data || null,
      faltasMes: faltasRes.count || 0,
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleLogout() {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  async function handleChangePhoto() {
    const options = ['Tirar foto', 'Escolher da galeria', 'Cancelar'];
    const pick = async (useCamera: boolean) => {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso nas configurações.');
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
        Alert.alert('Sucesso', 'Foto atualizada!');
      } catch (e: any) {
        Alert.alert('Erro', e.message || 'Não foi possível atualizar a foto.');
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
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function PodiumCard({ emp, position }: { emp: PodiumEmployee; position: 1 | 2 | 3 }) {
    const isFirst = position === 1;
    const colors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
    const heights = { 1: 90, 2: 70, 3: 55 };
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const initials = emp.full_name?.trim().split(' ').filter(Boolean);
    const ini = initials?.length > 1
      ? initials[0][0] + initials[initials.length - 1][0]
      : (initials?.[0]?.[0] || '?');
    return (
      <View style={[styles.podiumCard, isFirst && styles.podiumCardFirst]}>
        <Text style={styles.podiumMedal}>{medals[position]}</Text>
        {emp.photo_url ? (
          <Image
            source={{ uri: emp.photo_url }}
            style={[styles.podiumAvatar, { borderColor: colors[position], width: isFirst ? 64 : 52, height: isFirst ? 64 : 52, borderRadius: isFirst ? 32 : 26 }]}
          />
        ) : (
          <View style={[styles.podiumAvatarPlaceholder, { borderColor: colors[position], backgroundColor: colors[position] + '33', width: isFirst ? 64 : 52, height: isFirst ? 64 : 52, borderRadius: isFirst ? 32 : 26 }]}>
            <Text style={[styles.podiumInitials, { fontSize: isFirst ? 20 : 16 }]}>{ini.toUpperCase()}</Text>
          </View>
        )}
        <Text style={[styles.podiumName, isFirst && { fontSize: 13 }]} numberOfLines={1}>
          {emp.full_name?.split(' ')[0]}
        </Text>
        <View style={[styles.podiumScoreBadge, { backgroundColor: colors[position] + '22', borderColor: colors[position] + '66' }]}>
          <Text style={[styles.podiumScore, { color: colors[position] }]}>⭐ {emp.score}</Text>
        </View>
        <View style={[styles.podiumBase, { height: heights[position], backgroundColor: colors[position] + '22', borderTopColor: colors[position] }]}>
          <Text style={[styles.podiumPosition, { color: colors[position] }]}>{position}</Text>
        </View>
      </View>
    );
  }

  const quickActions = [
    { icon: 'wallet-outline' as const, label: 'Financeiro', tab: 'Financeiro' },
    { icon: 'document-text-outline' as const, label: 'Documentos', tab: 'Documentos' },
    { icon: 'time-outline' as const, label: 'Registro', tab: 'Registro' },
    { icon: 'sunny-outline' as const, label: 'Férias', tab: 'Ferias' },
  ];

  const saldoPositivo = dashboard.bancoHoras?.saldo_banco && !dashboard.bancoHoras.saldo_banco.startsWith('-');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Welcome Card */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.name}>{employee?.nome || 'Colaborador'}</Text>
            <Text style={styles.roleText}>{employee?.cargo || ''}</Text>
          </View>
          <View style={styles.welcomeRight}>
            <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto} style={styles.avatarContainer}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(employee?.nome)}</Text>
                </View>
              )}
              <View style={styles.avatarEdit}>
                <Ionicons name="camera" size={10} color="#FFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Pódio */}
      {podium.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🏆 Ranking</Text>
          <View style={styles.podiumContainer}>
            {podium[1] && <PodiumCard emp={podium[1]} position={2} />}
            {podium[0] && <PodiumCard emp={podium[0]} position={1} />}
            {podium[2] && <PodiumCard emp={podium[2]} position={3} />}
          </View>
        </>
      )}

      {/* Dashboard Cards */}
      <Text style={styles.sectionTitle}>Resumo</Text>
      <View style={styles.dashboardGrid}>
        {/* Último Holerite */}
        <TouchableOpacity style={styles.dashCard} onPress={() => navigation.navigate('Financeiro')}>
          <Ionicons name="wallet-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.dashLabel}>Último Holerite</Text>
          {dashboard.ultimoHolerite ? (
            <>
              <Text style={styles.dashValue}>{formatCurrency(dashboard.ultimoHolerite.valor_liquido)}</Text>
              <Text style={styles.dashMeta}>{formatPeriodo(dashboard.ultimoHolerite.periodo)}</Text>
            </>
          ) : (
            <Text style={styles.dashMeta}>—</Text>
          )}
        </TouchableOpacity>

        {/* Banco de Horas */}
        <TouchableOpacity style={styles.dashCard} onPress={() => navigation.navigate('Registro')}>
          <Ionicons name="time-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.dashLabel}>Banco de Horas</Text>
          {dashboard.bancoHoras?.saldo_banco ? (
            <Text style={[styles.dashValue, { color: saldoPositivo ? COLORS.SUCCESS : COLORS.ERROR }]}>
              {saldoPositivo ? '+' : ''}{dashboard.bancoHoras.saldo_banco}
            </Text>
          ) : (
            <Text style={styles.dashMeta}>—</Text>
          )}
          {dashboard.bancoHoras?.banco_horas_acumulado && (
            <Text style={styles.dashMeta}>Acum: {dashboard.bancoHoras.banco_horas_acumulado}</Text>
          )}
        </TouchableOpacity>

        {/* Faltas do Mês */}
        <TouchableOpacity style={styles.dashCard} onPress={() => navigation.navigate('Registro')}>
          <Ionicons name="alert-circle-outline" size={22} color={dashboard.faltasMes > 0 ? COLORS.ERROR : COLORS.SUCCESS} />
          <Text style={styles.dashLabel}>Faltas no Mês</Text>
          <Text style={[styles.dashValue, { color: dashboard.faltasMes > 0 ? COLORS.ERROR : COLORS.SUCCESS }]}>
            {dashboard.faltasMes}
          </Text>
        </TouchableOpacity>

        {/* Score */}
        <TouchableOpacity style={styles.dashCard} disabled>
          <Text style={{ fontSize: 22 }}>⭐</Text>
          <Text style={styles.dashLabel}>Score</Text>
          <Text style={[styles.dashValue, { color: COLORS.PRIMARY }]}>
            {dashboard.score != null ? dashboard.score : '—'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Acesso Rápido</Text>
      <View style={styles.grid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.gridItem}
            onPress={() => navigation.navigate(action.tab)}
          >
            <Ionicons name={action.icon} size={28} color={COLORS.PRIMARY} />
            <Text style={styles.gridLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Info */}
      <Text style={styles.sectionTitle}>Informações</Text>
      <View style={styles.infoCard}>
        <InfoRow label="Empresa" value={employee?.empresa || '—'} />
        <InfoRow label="Departamento" value={employee?.departamento || '—'} />
        <InfoRow label="Admissão" value={employee?.data_admissao || '—'} />
        <InfoRow label="Status" value={employee?.status || '—'} />
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
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
    paddingBottom: 40,
  },
  welcomeCard: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  welcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  welcomeRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  greeting: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2,
  },
  roleText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  scoreIcon: {
    fontSize: 14,
  },
  scoreText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 3,
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 24,
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
    fontSize: 20,
    marginBottom: 6,
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
    fontWeight: '800',
    color: '#FFF',
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 4,
    textAlign: 'center',
  },
  podiumScoreBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  podiumScore: {
    fontSize: 11,
    fontWeight: '800',
  },
  podiumBase: {
    width: '100%',
    borderTopWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  podiumPosition: {
    fontSize: 22,
    fontWeight: '900',
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 12,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  dashCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    padding: 16,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 4,
  },
  dashLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    marginTop: 6,
  },
  dashValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  dashMeta: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridItem: {
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginTop: 10,
  },
  infoCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
});
