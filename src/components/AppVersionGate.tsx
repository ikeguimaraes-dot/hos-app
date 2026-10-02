import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { supabase } from '../lib/supabase';
import { subscribeToRequiredUpdate } from '../lib/client-version';

type Policy = { supported: boolean; minimum_protocol: number; update_url: string | null };
type Status = 'checking' | 'allowed' | 'blocked' | 'offline';

/** The server remains authoritative on every sensitive RPC; this gate provides
 * the required-update UI and also fails closed if the policy cannot be fetched.
 */
export default function AppVersionGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [started, setStarted] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  const checkPolicy = useCallback(async () => {
    const current = ++generation.current;
    setStatus('checking');
    setMessage('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const { data, error } = await supabase.rpc('employee_app_policy').abortSignal(controller.signal);
      if (generation.current !== current) return;
      if (error || !data || typeof data.supported !== 'boolean' || !Number.isInteger(data.minimum_protocol)) {
        setStatus('offline');
        return;
      }
      setPolicy(data as Policy);
      if (data.supported) setStarted(true);
      setStatus(data.supported ? 'allowed' : 'blocked');
    } catch {
      if (generation.current === current) setStatus('offline');
    } finally { clearTimeout(timeout); }
  }, []);

  useEffect(() => {
    void checkPolicy();
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') void checkPolicy();
    });
    const unsubscribe = subscribeToRequiredUpdate(() => { void checkPolicy(); });
    return () => { generation.current++; appState.remove(); unsubscribe(); };
  }, [checkPolicy]);

  async function updateApp() {
    if (updating) return;
    setUpdating(true);
    setMessage('Buscando a atualização…');
    try {
      if (Platform.OS === 'web') {
        window.location.reload();
        return;
      }
      if (Updates.isEnabled) {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      }
      if (policy?.update_url?.startsWith('https://')) {
        await Linking.openURL(policy.update_url);
        setMessage('Instale a atualização e abra o HOS novamente.');
      } else {
        setMessage('Solicite ao RH a versão atual do aplicativo.');
      }
    } catch {
      setMessage('Não foi possível atualizar agora. Verifique a conexão ou solicite a versão atual ao RH.');
    } finally {
      setUpdating(false);
    }
  }

  let gate: ReactNode = null;
  if (status === 'checking') gate = (
    <View style={styles.container}>
      <ActivityIndicator color="#C4622D" size="large" />
      <Text style={styles.description}>Verificando o aplicativo…</Text>
    </View>
  );
  if (status === 'blocked' || status === 'offline') gate = (
    <View style={styles.container} accessibilityViewIsModal>
      <Text style={styles.title}>{status === 'blocked' ? 'Atualização necessária' : 'Verifique sua conexão'}</Text>
      <Text style={styles.description}>
        {status === 'blocked'
          ? 'Atualize o HOS para continuar usando sua conta.'
          : 'Precisamos verificar a versão do HOS antes de continuar. Conecte-se à internet e tente novamente.'}
      </Text>
      {status === 'blocked' && (
        <Pressable style={styles.button} onPress={() => { void updateApp(); }} disabled={updating}
          accessibilityRole="button" accessibilityLabel="Atualizar aplicativo HOS">
          <Text style={styles.buttonText}>{updating ? 'Atualizando…' : 'Atualizar aplicativo'}</Text>
        </Pressable>
      )}
      <Pressable style={styles.retry} onPress={() => { void checkPolicy(); }} disabled={updating}
        accessibilityRole="button" accessibilityLabel="Verificar novamente a versão">
        <Text style={styles.retryText}>Tentar novamente</Text>
      </Pressable>
      {!!message && <Text style={styles.description} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
  // Preserve the current flow when returning from camera/GPS permissions. The
  // overlay blocks interaction while rechecking without discarding form state.
  return (
    <View style={{ flex: 1 }}>
      {started && <View style={{ flex: 1, display: status === 'allowed' ? 'flex' : 'none' }}
        pointerEvents={status === 'allowed' ? 'auto' : 'none'}>{children}</View>}
      {gate && <View style={StyleSheet.absoluteFill}>{gate}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#F5F4F2' },
  title: { fontSize: 25, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', marginBottom: 16 },
  description: { fontSize: 16, lineHeight: 24, color: '#494949', textAlign: 'center', marginVertical: 16, maxWidth: 420 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#A84C20', borderRadius: 10 },
  buttonText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 24, marginTop: 12 },
  retryText: { fontSize: 16, color: '#8E3D18', fontWeight: '600' },
});
