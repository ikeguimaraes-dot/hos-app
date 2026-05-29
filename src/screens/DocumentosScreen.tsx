import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import { COLORS } from '../lib/types';

interface Document {
  id: string;
  name: string;
  type: string;
  storage_path: string;
  uploaded_at?: string;
}

export default function DocumentosScreen({ navigation }: any) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

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
    })();
  }, []);

  useEffect(() => {
    if (employeeId) fetchDocuments();
  }, [employeeId]);

  async function fetchDocuments() {
    if (!employeeId) return;

    const { data, error } = await supabase
      .from('documents')
      .select('id, name, type, storage_path, uploaded_at')
      .eq('employee_id', employeeId)
      .order('id', { ascending: false });

    if (error) console.error('[DOCUMENTOS] fetch error:', error);
    setDocuments(data || []);
    setLoading(false);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  }, [employeeId]);

  function getDocumentType(mimeType: string, fileName: string): string {
    const name = fileName.toLowerCase();
    if (name.includes('contrato')) return 'contrato';
    if (name.includes('holerite') || name.includes('recibo')) return 'holerite';
    if (name.includes('ferias')) return 'ferias';
    if (name.includes('admissao')) return 'admissao';
    return 'outro';
  }

  async function uploadFile(uri: string, fileName: string, mimeType: string) {
    if (!employeeId) return;
    setUploading(true);
    setModalVisible(false);

    try {
      const timestamp = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${employeeId}/${timestamp}_${safeName}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { data: storageData, error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, byteArray, { contentType: mimeType });

      console.log('[DOC UPLOAD] storage upload data:', storageData);
      console.log('[DOC UPLOAD] storage upload error:', storageError);

      if (storageError) {
        throw new Error(storageError.message);
      }

      const docType = getDocumentType(mimeType, fileName);

      const { data: emp } = await supabase
        .from('employees')
        .select('id, unit_id')
        .eq('id', employeeId)
        .single();

      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          employee_id: employeeId,
          unit_id: emp?.unit_id ?? null,
          name: fileName,
          type: docType,
          storage_path: storagePath,
        });

      if (insertError) console.error('[DOCUMENTOS] insert error:', insertError);

      if (insertError) {
        throw new Error(insertError.message);
      }

      await fetchDocuments();
      Alert.alert('Sucesso', 'Documento enviado com sucesso.');
    } catch (error: any) {
      console.error('[DOCUMENTOS] upload error:', error);
      Alert.alert('Erro no envio', error.message || 'Não foi possível enviar o documento.');
    } finally {
      setUploading(false);
    }
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações do dispositivo.');
      setModalVisible(false);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      setModalVisible(false);
      return;
    }

    const asset = result.assets[0];
    const fileName = asset.fileName || `foto_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';
    await uploadFile(asset.uri, fileName, mimeType);
  }

  async function handleDocumentPicker() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      setModalVisible(false);
      return;
    }

    const asset = result.assets[0];
    await uploadFile(asset.uri, asset.name, asset.mimeType || 'application/pdf');
  }

  async function handleView(doc: Document) {
    console.log('[VIEW] botao tocado:', doc.name);
    console.log('[VIEW] storage_path:', doc.storage_path);
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600);
    console.log('[VIEW] signedUrl:', data?.signedUrl);
    console.log('[VIEW] error:', JSON.stringify(error));
    if (error || !data?.signedUrl) {
      console.log('[VIEW] FALHOU - abortando');
      return;
    }
    console.log('[VIEW] abrindo URL...');
    Linking.openURL(data.signedUrl);
  }

  function getIcon(type: string) {
    if (type === 'pdf') return '📄';
    if (type === 'image') return '🖼️';
    return '📋';
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function renderItem({ item }: { item: Document }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardIcon}>{getIcon(item.type)}</Text>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {item.type.toUpperCase()}{item.uploaded_at ? ` · ${formatDate(item.uploaded_at)}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.viewButton} onPress={() => handleView(item)}>
            <Text style={styles.viewButtonText}>Visualizar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderEmpty() {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <Ionicons name="document-text-outline" size={64} color={COLORS.BORDER} />
        <Text style={styles.emptyTitle}>Nenhum documento</Text>
        <Text style={styles.emptySubtitle}>
          Toque em "+ Enviar Documento" para enviar seu primeiro arquivo.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={uploading}
      >
        {uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color="#FFF" size="small" />
            <Text style={styles.uploadButtonText}>  Enviando...</Text>
          </View>
        ) : (
          <Text style={styles.uploadButtonText}>+ Enviar Documento</Text>
        )}
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={documents.length === 0 ? styles.listEmpty : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <Modal visible={!!viewerUrl} animationType="slide" onRequestClose={() => setViewerUrl(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <TouchableOpacity
            onPress={() => setViewerUrl(null)}
            style={{ padding: 16, paddingTop: 56, backgroundColor: '#1a1a1a' }}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>← Fechar</Text>
          </TouchableOpacity>
          {viewerUrl && (
            <WebView
              source={{ uri: viewerUrl }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              onError={(e) => console.log('[VIEWER] erro:', e.nativeEvent)}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Enviar documento</Text>

            <TouchableOpacity style={styles.sheetOption} onPress={handleCamera}>
              <Ionicons name="camera-outline" size={24} color={COLORS.PRIMARY} />
              <Text style={styles.sheetOptionText}>Tirar foto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetOption} onPress={handleDocumentPicker}>
              <Ionicons name="document-outline" size={24} color={COLORS.PRIMARY} />
              <Text style={styles.sheetOptionText}>Escolher arquivo PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.sheetCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  uploadButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.7,
  },
  uploadButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 20,
    paddingTop: 12,
  },
  listEmpty: {
    flexGrow: 1,
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.TEXT,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
  viewButton: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    minHeight: 44,
    justifyContent: 'center',
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 20,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  sheetOptionText: {
    fontSize: 16,
    color: COLORS.TEXT,
    marginLeft: 14,
  },
  sheetCancel: {
    alignItems: 'center',
    paddingTop: 20,
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
  },
});
