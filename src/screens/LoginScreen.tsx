import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { login } from '../lib/auth';
import { COLORS, RADIUS, SHADOW } from '../lib/types';

export default function LoginScreen({ navigation }: any) {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ cpf?: string; password?: string; general?: string }>({});
  const [cpfFocused, setCpfFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  function formatCpf(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function validateCpf() {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) {
      setErrors(e => ({ ...e, cpf: 'CPF inválido — confira os 11 dígitos' }));
      return false;
    }
    setErrors(e => ({ ...e, cpf: undefined }));
    return true;
  }

  function validatePassword() {
    if (!password) {
      setErrors(e => ({ ...e, password: 'Digite sua senha' }));
      return false;
    }
    setErrors(e => ({ ...e, password: undefined }));
    return true;
  }

  async function handleLogin() {
    const cpfOk = validateCpf();
    const pwOk = validatePassword();
    if (!cpfOk || !pwOk) return;

    setErrors({});
    setLoading(true);
    try {
      await login(cpf.replace(/\D/g, ''), password);
      navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
    } catch (error: any) {
      setErrors({ general: error.message || 'CPF ou senha incorretos. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Topo colorido */}
      <View style={styles.topSection}>
        <Text style={styles.logo} accessibilityRole="header">HOS</Text>
        <Text style={styles.subtitle}>Acesse sua conta</Text>
      </View>

      {/* Scroll com card flutuante */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {/* CPF */}
          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={[styles.input, cpfFocused && styles.inputFocused, errors.cpf ? styles.inputError : null]}
            placeholder="000.000.000-00"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="numeric"
            value={cpf}
            onChangeText={(v) => {
              setCpf(formatCpf(v));
              if (errors.cpf) setErrors(e => ({ ...e, cpf: undefined }));
            }}
            onFocus={() => setCpfFocused(true)}
            onBlur={() => { setCpfFocused(false); validateCpf(); }}
            maxLength={14}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="CPF"
            accessibilityHint="Digite seu CPF no formato 000.000.000-00"
          />
          {errors.cpf ? <Text style={styles.fieldError}>{errors.cpf}</Text> : null}

          {/* Senha */}
          <Text style={[styles.label, { marginTop: 16 }]}>Senha</Text>
          <View style={[styles.inputWrapper, pwFocused && styles.inputFocused, errors.password ? styles.inputError : null]}>
            <TextInput
              ref={passwordRef}
              style={styles.inputInner}
              placeholder="Digite sua senha"
              placeholderTextColor={COLORS.textTertiary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errors.password) setErrors(e => ({ ...e, password: undefined }));
              }}
              onFocus={() => setPwFocused(true)}
              onBlur={() => { setPwFocused(false); validatePassword(); }}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              accessibilityLabel="Senha"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              accessibilityRole="button"
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}

          {/* Erro geral */}
          {errors.general ? (
            <View style={styles.generalError}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
              <Text style={styles.generalErrorText}>{errors.general}</Text>
            </View>
          ) : null}

          {/* Botão entrar */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityLabel="Entrar"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('PrimeiroAcesso')}
            accessibilityLabel="Primeiro acesso — criar senha"
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>Primeiro acesso</Text>
          </TouchableOpacity>

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.separatorLine} />
          </View>

          <TouchableOpacity
            style={styles.candidateButton}
            onPress={() => navigation.navigate('CandidateLogin')}
            accessibilityLabel="Sou candidato — acessar entrevista"
            accessibilityRole="button"
          >
            <Text style={styles.candidateButtonText}>Sou candidato</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Topo com cor da marca ─────────────────────────────────────────────────
  topSection: {
    backgroundColor: COLORS.primary,
    paddingTop: 72,
    paddingBottom: 56,
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.textInverse,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },

  // ── Scroll + card flutuante ───────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 24,
    paddingTop: 28,
    marginTop: -32,     // overlap sobre o topSection
    ...SHADOW.md,
  },

  // ── Inputs ────────────────────────────────────────────────────────────────
  label: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textPrimary,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...(Platform.OS === 'web' && { outlineWidth: 0 } as object),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textPrimary,
    ...(Platform.OS === 'web' && { outlineWidth: 0 } as object),
  },
  inputFocused: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  inputError: {
    borderColor: COLORS.error,
    borderWidth: 1.5,
  },
  eyeButton: {
    padding: 8,
    minWidth: 36,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: {
    fontSize: 12,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.error,
    marginTop: 4,
    marginLeft: 4,
  },
  generalError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.sm,
    padding: 10,
    marginTop: 12,
    gap: 6,
  },
  generalErrorText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.error,
    flex: 1,
  },

  // ── Botão principal ───────────────────────────────────────────────────────
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
  },

  // ── Links secundários ─────────────────────────────────────────────────────
  linkButton: {
    alignItems: 'center',
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'InstrumentSans_500Medium',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  separatorText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.textSecondary,
  },
  candidateButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 52,
    justifyContent: 'center',
  },
  candidateButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'InstrumentSans_500Medium',
  },
});
