import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/types';
import type { Candidate } from '../lib/types';

export default function CandidateLoginScreen({ navigation }: any) {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEnter() {
    const code = accessCode.trim();
    if (!code) {
      Alert.alert('Erro', 'Digite seu código de acesso');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('access_code', code)
        .single();

      if (error || !data) {
        Alert.alert('Código inválido', 'Verifique o código e tente novamente.');
        return;
      }

      const candidate = data as Candidate;

      if (candidate.status === 'concluido') {
        Alert.alert('Entrevista concluída', 'Esta entrevista já foi realizada.');
        return;
      }

      navigation.navigate('Interview', { candidate });
    } catch {
      Alert.alert('Erro', 'Não foi possível verificar o código. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.TEXT} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.logo}>HOS</Text>
          <Text style={styles.subtitle}>Área do Candidato</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.description}>
            Digite o código de acesso que você recebeu para iniciar sua entrevista.
          </Text>

          <Text style={styles.label}>Código de Acesso</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: CAND-AB3X"
            placeholderTextColor={COLORS.TEXT_SECONDARY}
            value={accessCode}
            onChangeText={(v) => setAccessCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleEnter}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Entrar na Entrevista</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 24,
    padding: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.PRIMARY,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
  },
  form: {
    backgroundColor: COLORS.CARD,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  description: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 20,
    lineHeight: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.TEXT,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    letterSpacing: 3,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
