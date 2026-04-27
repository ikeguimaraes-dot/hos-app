import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/types';
import type { Candidate } from '../lib/types';

export default function InterviewCompleteScreen({ route, navigation }: any) {
  const { candidate }: { candidate: Candidate } = route.params;

  useEffect(() => {
    supabase
      .from('candidates')
      .update({ status: 'concluido' })
      .eq('id', candidate.id);
  }, []);

  function handleExit() {
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <Ionicons name="checkmark-circle" size={96} color={COLORS.SUCCESS} />
        </View>

        <Text style={styles.title}>Entrevista concluída!</Text>
        <Text style={styles.message}>
          Entraremos em contato em breve.
        </Text>
      </View>

      <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
        <Text style={styles.exitButtonText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    padding: 32,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  iconWrapper: {
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.TEXT,
    textAlign: 'center',
  },
  message: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 28,
  },
  exitButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  exitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
