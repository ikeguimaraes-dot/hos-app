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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { login } from '../lib/auth';
import { COLORS } from '../lib/types';

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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logo} accessibilityRole="header">HOS</Text>
          <Text style={styles.subtitle}>Hospitalidade por método.</Text>
        </View>

        <View style={styles.form}>
          {/* CPF */}
          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={[styles.input, cpfFocused && styles.inputFocused, errors.cpf ? styles.inputError : null]}
            placeholder="000.000.000-00"
            placeholderTextColor={COLORS.TEXT_SECONDARY}
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
          {errors.cpf ? <Text style={styles.fieldError} accessibilityLiveRegion="assertive">{errors.cpf}</Text> : null}

          {/* Senha */}
          <Text style={[styles.label, { marginTop: 16 }]}>Senha</Text>
          <View style={[styles.inputWrapper, pwFocused && styles.inputFocused, errors.password ? styles.inputError : null]}>
            <TextInput
              ref={passwordRef}
              style={styles.inputInner}
              placeholder="Digite sua senha"
              placeholderTextColor={COLORS.TEXT_SECONDARY}
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
              accessibilityHint="Digite sua senha de acesso"
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
                color={COLORS.TEXT_SECONDARY}
                accessible={false}
              />
            </TouchableOpacity>
          </View>
          {errors.password ? <Text style={styles.fieldError} accessibilityLiveRegion="assertive">{errors.password}</Text> : null}

          {/* Erro geral */}
          {errors.general ? (
            <View style={styles.generalError}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.ERROR_TEXT} accessible={false} />
              <Text style={styles.generalErrorText} accessibilityLiveRegion="assertive">{errors.general}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityLabel="Entrar"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <View accessible accessibilityLabel="Entrando..." accessibilityLiveRegion="polite">
                <ActivityIndicator color="#FFF" />
              </View>
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
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 52,
    fontFamily: 'Fraunces_700Bold',
    color: COLORS.PRIMARY,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
    marginTop: 6,
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
  label: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    paddingHorizontal: 16,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT,
  },
  inputFocused: {
    borderColor: COLORS.PRIMARY,
    borderWidth: 2,
  },
  inputError: {
    borderColor: COLORS.ERROR,
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
    color: COLORS.ERROR_TEXT,
    marginTop: 4,
    marginLeft: 4,
  },
  generalError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 6,
  },
  generalErrorText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.ERROR_TEXT,
    flex: 1,
  },
  button: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'InstrumentSans_600SemiBold',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: COLORS.TEXT_SECONDARY,
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
    backgroundColor: COLORS.BORDER,
  },
  separatorText: {
    fontSize: 13,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.TEXT_SECONDARY,
  },
  candidateButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    minHeight: 52,
    justifyContent: 'center',
  },
  candidateButtonText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: 'InstrumentSans_500Medium',
  },
});
