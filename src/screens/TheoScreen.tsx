import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSession } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

const THEO_URL = 'https://theo-kph-production.up.railway.app';
const TIMEOUT_MS = 15000;

interface Message {
  id: string;
  role: 'user' | 'theo';
  content: string;
  timestamp: Date;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'theo',
  content:
    'Olá! Sou o Theo, seu assistente KPH. Posso te ajudar com informações sobre seu ponto, banco de horas, férias, holerites e muito mais. Como posso te ajudar?',
  timestamp: new Date(),
};

// ─── Componente de pontinhos animados ─────────────────────────────────────────

function TypingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  const dots = '.'.repeat(frame);
  return (
    <View style={styles.bubbleTheo}>
      <Text style={[styles.bubbleText, { color: COLORS.textTertiary, letterSpacing: 2 }]}>
        {dots || '\u00A0'}
      </Text>
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function TheoScreen({ navigation }: any) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

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
      // session_id estável por colaborador
      setSessionId(`hos_${session.employee.id}`);
    })();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !sessionId) return;

    setInput('');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${THEO_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:  sessionId,
          message:     text,
          employee_id: employeeId ?? undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const replyText: string =
        data.reply ?? data.message ?? 'Não consegui processar sua mensagem.';

      const theoMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'theo',
        content: replyText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, theoMsg]);
    } catch (e: any) {
      const isTimeout = e?.name === 'AbortError';
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'theo',
        content: isTimeout
          ? 'Demorei mais que o esperado para responder. Tente novamente em alguns instantes.'
          : 'Desculpe, estou com dificuldades no momento. Tente novamente em alguns instantes.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isTheo = item.role === 'theo';
    return (
      <View style={[styles.row, isTheo ? styles.rowTheo : styles.rowUser]}>
        {isTheo && (
          <View style={styles.avatar}>
            <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.primary} />
          </View>
        )}
        <View style={[isTheo ? styles.bubbleTheo : styles.bubbleUser, { maxWidth: '78%' }]}>
          <Text style={[styles.bubbleText, isTheo ? styles.textTheo : styles.textUser]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
        </View>
        <View>
          <Text style={styles.headerTitle}>Theo</Text>
          <Text style={styles.headerSub}>Assistente KPH</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Lista de mensagens */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={loading ? <TypingDots /> : null}
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Pergunte ao Theo..."
            placeholderTextColor={COLORS.textTertiary}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!loading}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.textInverse} />
            ) : (
              <Ionicons name="send" size={18} color={COLORS.textInverse} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.primary,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textInverse,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },

  // Lista
  list: { padding: 16, paddingBottom: 8 },

  // Linhas
  row:     { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  rowTheo: { justifyContent: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },

  // Avatar Theo
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },

  // Bolhas
  bubbleTheo: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...SHADOW.sm,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  textTheo:   { color: COLORS.textPrimary, fontFamily: 'InstrumentSans_400Regular' },
  textUser:   { color: COLORS.textInverse, fontFamily: 'InstrumentSans_400Regular' },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textPrimary,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.4 },
});
