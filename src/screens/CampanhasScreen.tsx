import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS } from '../lib/types';

interface Campaign {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  category: string;
  target: string;
  target_value?: string;
  starts_at?: string;
  ends_at?: string;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  saude: '#166534',    // verde escuro — contraste WCAG AA sobre fundos claros
  evento: '#C4622D',   // HOS Brasa — cor primária KPH
  comunicado: '#92400E', // âmbar escuro — contraste WCAG AA
};

const CATEGORY_ICONS: Record<string, any> = {
  saude: 'heart-outline',
  evento: 'calendar-outline',
  comunicado: 'megaphone-outline',
};

const CATEGORY_LABELS: Record<string, string> = {
  saude: 'Saúde',
  evento: 'Evento',
  comunicado: 'Comunicado',
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const [ano, mes, dia] = dateStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function CampanhasScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [employee, setEmployee] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (session) setEmployee(session.employee);
    })();
  }, []);

  useEffect(() => {
    if (employee) fetchCampaigns();
  }, [employee]);

  async function fetchCampaigns() {
    if (!employee) return;

    const { data, error } = await supabase.rpc('get_active_campaigns');

    if (error) console.error('[CAMPANHAS] error:', error);

    // Filtra em JS para evitar injeção via .or() string interpolation
    const filtered = (data || []).filter((c: Campaign) =>
      c.target === 'all' ||
      (c.target === 'department' && c.target_value === employee.departamento)
    );
    setCampaigns(filtered);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCampaigns();
    setRefreshing(false);
  }, [employee]);

  function renderItem({ item }: { item: Campaign }) {
    const color = CATEGORY_COLORS[item.category] || COLORS.PRIMARY;
    const icon = CATEGORY_ICONS[item.category] || 'megaphone-outline';
    const label = CATEGORY_LABELS[item.category] || item.category;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelected(item)}
        activeOpacity={0.85}
        accessibilityLabel={`${label}: ${item.title}. Toque para ver detalhes.`}
        accessibilityRole="button"
      >
        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
        )}
        <View style={styles.cardBody}>
          <View style={[styles.categoryBadge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
            <Ionicons name={icon} size={12} color={color} />
            <Text style={[styles.categoryText, { color }]}>{label}</Text>
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.description && (
            <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
          )}
          {(item.starts_at || item.ends_at) && (
            <Text style={styles.cardDate}>
              {item.starts_at && `De ${formatDate(item.starts_at)}`}
              {item.ends_at && ` até ${formatDate(item.ends_at)}`}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={campaigns.length === 0 ? styles.listEmpty : styles.list}
        data={campaigns}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={64} color={COLORS.BORDER} />
            <Text style={styles.emptyTitle}>Nenhuma campanha ativa</Text>
            <Text style={styles.emptySubtitle}>As campanhas internas da equipe aparecem aqui.</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      <Modal
        visible={!!selected}
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        accessibilityViewIsModal
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setSelected(null)}
            accessibilityLabel="Fechar campanha"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={COLORS.TEXT} accessible={false} />
          </TouchableOpacity>
          {selected && (
            <ScrollView contentContainerStyle={styles.modalContent}>
              {selected.image_url && (
                <Image source={{ uri: selected.image_url }} style={styles.modalImage} resizeMode="cover" />
              )}
              <View style={styles.modalBody}>
                <View style={[styles.categoryBadge, {
                  backgroundColor: (CATEGORY_COLORS[selected.category] || COLORS.PRIMARY) + '22',
                  borderColor: (CATEGORY_COLORS[selected.category] || COLORS.PRIMARY) + '55',
                  alignSelf: 'flex-start',
                }]}>
                  <Ionicons name={CATEGORY_ICONS[selected.category] || 'megaphone-outline'} size={12} color={CATEGORY_COLORS[selected.category] || COLORS.PRIMARY} />
                  <Text style={[styles.categoryText, { color: CATEGORY_COLORS[selected.category] || COLORS.PRIMARY }]}>
                    {CATEGORY_LABELS[selected.category] || selected.category}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>{selected.title}</Text>
                {(selected.starts_at || selected.ends_at) && (
                  <Text style={styles.modalDate}>
                    {selected.starts_at && `De ${formatDate(selected.starts_at)}`}
                    {selected.ends_at && ` até ${formatDate(selected.ends_at)}`}
                  </Text>
                )}
                {selected.description && (
                  <Text style={styles.modalDescription}>{selected.description}</Text>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  center: { justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  listEmpty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: COLORS.CARD,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImage: { width: '100%', height: 160 },
  cardBody: { padding: 16 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    marginBottom: 8,
  },
  categoryText: { fontSize: 11, fontFamily: 'InstrumentSans_600SemiBold' },
  cardTitle: { fontSize: 16, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.TEXT, marginBottom: 6 },
  cardDescription: { fontSize: 14, fontFamily: 'InstrumentSans_400Regular', color: COLORS.TEXT_SECONDARY, lineHeight: 20, marginBottom: 8 },
  cardDate: { fontSize: 12, fontFamily: 'InstrumentSans_400Regular', color: COLORS.TEXT_SECONDARY },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontFamily: 'Fraunces_700Bold', color: COLORS.TEXT, marginTop: 16 },
  emptySubtitle: { fontSize: 15, fontFamily: 'InstrumentSans_400Regular', color: COLORS.TEXT_SECONDARY, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  modalContainer: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  modalClose: { position: 'absolute', top: 56, right: 20, zIndex: 10, backgroundColor: COLORS.CARD, borderRadius: 20, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  modalContent: { paddingBottom: 40 },
  modalImage: { width: '100%', height: 260 },
  modalBody: { padding: 20 },
  modalTitle: { fontSize: 22, fontFamily: 'Fraunces_700Bold', color: COLORS.TEXT, marginTop: 12, marginBottom: 8, letterSpacing: -0.5 },
  modalDate: { fontSize: 13, fontFamily: 'InstrumentSans_400Regular', color: COLORS.TEXT_SECONDARY, marginBottom: 16 },
  modalDescription: { fontSize: 16, fontFamily: 'InstrumentSans_400Regular', color: COLORS.TEXT, lineHeight: 26 },
});
