import { HOS_CLIENT_PROTOCOL, reportRequiredUpdate } from './client-version';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Opaque employee sessions are independent of the Supabase API/signing key. */
export const employeeFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const expectedBase = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const isProjectRequest = !!expectedBase && url.startsWith(expectedBase + '/');
  if (isProjectRequest) {
    headers.set('X-HOS-Protocol', String(HOS_CLIENT_PROTOCOL));
    const raw = await AsyncStorage.getItem('@hos_session');
    if (raw) {
      try {
        const session = JSON.parse(raw);
        if (/^[a-f0-9]{64}$/.test(session.token || '') && Date.parse(session.expiresAt) > Date.now() &&
            session.supabaseRef === expectedBase?.match(/\/\/([^.]+)\./)?.[1]) {
          headers.set('X-Employee-Session', session.token);
        }
      } catch { /* Invalid local data never grants a session. */ }
    }
  }
  const response = await fetch(input, { ...init, headers });
  if (isProjectRequest && response.status === 426) reportRequiredUpdate();
  return response;
};
