import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

interface Document {
  id: string;
  name: string;
  type: string;
  storage_path: string;
  uploaded_at?: string;
}

interface Categoria {
  id: string;
  label: string;
  icon: string;
  obrigatorio: boolean;
}

const CATEGORIAS_OBRIGATORIAS: Categoria[] = [
  { id: 'rg_cnh',             label: 'RG ou CNH',                    icon: 'card-outline',          obrigatorio: true },
  { id: 'cpf',                label: 'CPF',                          icon: 'document-text-outline', obrigatorio: true },
  { id: 'residencia',         label: 'Comprovante de Residência',    icon: 'home-outline',          obrigatorio: true },
  { id: 'foto_3x4',           label: 'Foto 3×4',                     icon: 'camera-outline',        obrigatorio: true },
  { id: 'ctps',               label: 'Carteira de Trabalho (CTPS)', icon: 'briefcase-outline',     obrigatorio: true },
  { id: 'exame_admissional',  label: 'Exame Admissional',            icon: 'medkit-outline',        obrigatorio: true },
  { id: 'dados_bancarios',    label: 'Dados Bancários',              icon: 'wallet-outline',        obrigatorio: true },
];

const CATEGORIAS_OUTRAS: Categoria[] = [
  { id: 'certidao_filhos', label: 'Certidão de Nascimento (filhos)', icon: 'people-outline',        obrigatorio: false },
  { id: 'atestado',        label: 'Atestado Médico',                 icon: 'medical-outline',       obrigatorio: false },
  { id: 'declaracao_ir',   label: 'Declaração de IR',                icon: 'receipt-outline',       obrigatorio: false },
  { id: 'outro',           label: 'Outro documento',                 icon: 'attach-outline',        obrigatorio: false },
];

export default function DocumentosScreen({ navigation }: any) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

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
    if (employeeId) fetchDocuments();
  }, [employeeId]);

  async function fetchDocuments() {
    if (!employeeId) return;
    try {
      const { data } = await supabase.rpc('get_my_documents', { p_employee_id: employeeId });
      setDocuments(data || []);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  }, [employeeId]);

  function hasDoc(catId: string): boolean {
    return documents.some(d => d.type === catId);
  }

  function openUpload(cat: Categoria) {
    setSelectedCategoria(cat);
    setPickerVisible(true);
  }

  async function uploadFile(uri: string, fileName: string, mimeType: string) {
    if (!employeeId || !selectedCategoria) return;
    setUploading(true);
    setPickerVisible(false);

    try {
      const timestamp = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${employeeId}/${timestamp}_${safeName}`;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, byteArray, { contentType: mimeType });

      if (storageError) throw new Error(storageError.message);

      const { error: insertError } = await supabase.rpc('insert_document', {
        p_employee_id:  employeeId,
        p_unit_id:      unitId,
        p_name:         fileName,
        p_type:         selectedCategoria.id,
        p_storage_path: storagePath,
      });

      if (insertError) throw new Error(insertError.message);

      await fetchDocuments();
      Alert.alert('Enviado!', `${selectedCategoria.label} enviado com sucesso.`);
    } catch {
      Alert.alert('Erro no envio', 'Não foi possível enviar o arquivo. Tente novamente.');
    } finally {
      setUploading(false);
      setSelectedCategoria(null);
    }
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.');
      setPickerVisible(false);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.length) { setPickerVisible(false); return; }
    const asset = result.assets[0];
    await uploadFile(asset.uri, asset.fileName || `foto_${Date.now()}.jpg`, asset.mimeType || 'image/jpeg');
  }

  async function handleDocumentPicker() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) { setPickerVisible(false); return; }
    const asset = result.assets[0];
    await uploadFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
  }

  function renderCatCard(cat: Categoria) {
    const done = hasDoc(cat.id);
    return (
      <TouchableOpacity
        key={cat.id}
        style={[styles.catCard, done && styles.catCardDone]}
        onPress={() => !uploading && openUpload(cat)}
        activeOpacity={0.75}
        accessibilityLabel={`${cat.label} — ${done ? 'enviado' : 'pendente'}`}
        accessibilityRole="button"
      >
        <View style={[styles.catIcon, done && styles.catIconDone]}>
          <Ionicons name={cat.icon as any} size={22} color={done ? COLORS.success : COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.catLabel}>{cat.label}</Text>
        </View>
        {done ? (
          <View style={styles.badgeDone}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
            <Text style={styles.badgeDoneText}>Enviado</Text>
          </View>
        ) : (
          <View style={styles.badgePending}>
            <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
            <Text style={styles.badgePendingText}>Pendente</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const obrigatoriosEnviados = CATEGORIAS_OBRIGATORIAS.filter(c => hasDoc(c.id)).length;
  const obrigatoriosTotal    = CATEGORIAS_OBRIGATORIAS.length;
  const completo             = obrigatoriosEnviados === obrigatoriosTotal;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Progresso */}
        <View style={[styles.progressCard, completo && styles.progressCardDone]}>
          <Ionicons
            name={completo ? 'checkmark-circle' : 'document-text-outline'}
            size={28}
            color={completo ? COLORS.success : COLORS.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.progressTitle}>
              {completo ? 'Documentação completa! 🎉' : 'Documentação obrigatória'}
            </Text>
            <Text style={styles.progressSub}>
              {obrigatoriosEnviados} de {obrigatoriosTotal} documentos enviados
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(obrigatoriosEnviados / obrigatoriosTotal) * 100}%` as any }]} />
            </View>
          </View>
        </View>

        {/* Obrigatórios */}
        <Text style={styles.sectionTitle}>Documentos obrigatórios</Text>
        {CATEGORIAS_OBRIGATORIAS.map(renderCatCard)}

        {/* Outros */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Outros documentos</Text>
        {CATEGORIAS_OUTRAS.map(renderCatCard)}
      </ScrollView>

      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.textInverse} />
          <Text style={styles.uploadingText}>Enviando...</Text>
        </View>
      )}

      {/* Picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPickerVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {selectedCategoria?.label || 'Enviar documento'}
            </Text>

            <TouchableOpacity style={styles.sheetOption} onPress={handleCamera}>
              <Ionicons name="camera-outline" size={24} color={COLORS.primary} />
              <Text style={styles.sheetOptionText}>Tirar foto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetOption} onPress={handleDocumentPicker}>
              <Ionicons name="document-outline" size={24} color={COLORS.primary} />
              <Text style={styles.sheetOptionText}>Escolher arquivo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scroll:  { padding: 20, paddingBottom: 48 },

  // Progresso
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  progressCardDone: { borderColor: COLORS.success + '66' },
  progressTitle: { fontSize: 15, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textPrimary, marginBottom: 2 },
  progressSub:   { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
  progressBar:   { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },

  // Seção
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Card de categoria
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  catCardDone:    { borderColor: COLORS.success + '44', backgroundColor: COLORS.success + '08' },
  catIcon:        { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  catIconDone:    { backgroundColor: COLORS.success + '22' },
  catLabel:       { fontSize: 14, fontFamily: 'InstrumentSans_500Medium', color: COLORS.textPrimary },

  // Badges
  badgeDone:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.success + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  badgeDoneText:    { fontSize: 12, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.success },
  badgePending:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.warning + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  badgePendingText: { fontSize: 12, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.warning },

  // Uploading overlay
  uploadingOverlay: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.textPrimary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    ...SHADOW.md,
  },
  uploadingText: { fontSize: 14, fontFamily: 'InstrumentSans_600SemiBold', color: COLORS.textInverse },

  // Picker modal
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle:       { fontSize: 16, fontFamily: 'Fraunces_700Bold', color: COLORS.textPrimary, marginBottom: 20 },
  sheetOption:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, minHeight: 56, gap: 14 },
  sheetOptionText:  { fontSize: 16, fontFamily: 'InstrumentSans_400Regular', color: COLORS.textPrimary },
  sheetCancel:      { alignItems: 'center', paddingTop: 20, minHeight: 44, justifyContent: 'center' },
  sheetCancelText:  { fontSize: 16, fontFamily: 'InstrumentSans_500Medium', color: COLORS.textSecondary },
});
