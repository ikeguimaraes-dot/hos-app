import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/types';
import type { Candidate, InterviewQuestion } from '../lib/types';

type RecordingState = 'idle' | 'camera_open' | 'recording' | 'recorded' | 'uploading';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function InterviewScreen({ route, navigation }: any) {
  const { candidate }: { candidate: Candidate } = route.params;

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionVideoUrl, setQuestionVideoUrl] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingVideo, setLoadingVideo] = useState(false);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const cameraRef = useRef<CameraView>(null);
  const questionVideoRef = useRef<Video>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingIntentRef = useRef(false);

  useEffect(() => {
    initInterview();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cameraRef.current?.stopRecording();
    };
  }, []);

  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length) {
      setQuestionVideoUrl(null);
      loadQuestionVideo(questions[currentIndex]);
    }
  }, [currentIndex, questions]);

  async function initInterview() {
    try {
      await supabase
        .from('candidates')
        .update({ status: 'em_andamento' })
        .eq('id', candidate.id);

      const { data: questionsData, error: questionsError } = await supabase
        .from('interview_questions')
        .select('*')
        .eq('job_opening_id', candidate.job_opening_id)
        .order('ordem', { ascending: true });

      if (questionsError) throw questionsError;

      if (!questionsData || questionsData.length === 0) {
        Alert.alert('Erro', 'Nenhuma pergunta encontrada para esta vaga.');
        navigation.goBack();
        return;
      }

      const { data: responsesData } = await supabase
        .from('interview_responses')
        .select('question_id')
        .eq('candidate_id', candidate.id);

      const answeredIds = new Set((responsesData ?? []).map((r: any) => r.question_id));
      const startIndex = questionsData.findIndex((q: any) => !answeredIds.has(q.id));

      if (startIndex === -1) {
        navigation.replace('InterviewComplete', { candidate });
        return;
      }

      setQuestions(questionsData as InterviewQuestion[]);
      setCurrentIndex(startIndex);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a entrevista. Verifique sua conexão e tente novamente.');
      navigation.goBack();
    } finally {
      setLoadingInit(false);
    }
  }

  async function loadQuestionVideo(question: InterviewQuestion) {
    setLoadingVideo(true);
    try {
      const { data, error } = await supabase.storage
        .from('interview-videos')
        .createSignedUrl(question.video_path, 3600);
      if (error) throw error;
      setQuestionVideoUrl(data.signedUrl);
    } catch {
      Alert.alert('Aviso', 'Não foi possível carregar o vídeo desta pergunta.');
    } finally {
      setLoadingVideo(false);
    }
  }

  function startTimer() {
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async function handleStartRecording() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso à câmera nas configurações do dispositivo para gravar sua resposta.'
        );
        return;
      }
    }
    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result.granted) {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso ao microfone nas configurações do dispositivo para gravar sua resposta.'
        );
        return;
      }
    }
    recordingIntentRef.current = true;
    setRecordingState('camera_open');
  }

  const handleCameraReady = useCallback(async () => {
    if (!recordingIntentRef.current) return;
    recordingIntentRef.current = false;

    setRecordingState('recording');
    startTimer();

    let uri: string | null = null;
    try {
      const result = await cameraRef.current?.recordAsync({ maxDuration: 180 });
      uri = result?.uri ?? null;
    } catch {
      // Recording was aborted or interrupted
    }

    stopTimer();
    if (uri) {
      setRecordedUri(uri);
      setRecordingState('recorded');
    } else {
      setRecordingState('idle');
    }
  }, []);

  function handleStopRecording() {
    cameraRef.current?.stopRecording();
  }

  function handleRerecord() {
    setRecordedUri(null);
    setRecordingSeconds(0);
    setRecordingState('idle');
  }

  async function handleSendResponse() {
    if (!recordedUri || questions.length === 0) return;
    const currentQuestion = questions[currentIndex];

    setRecordingState('uploading');
    try {
      const storagePath = `candidates/${candidate.id}/${currentQuestion.id}.mp4`;

      const fileResponse = await fetch(recordedUri);
      const blob = await fileResponse.blob();

      const { error: uploadError } = await supabase.storage
        .from('interview-videos')
        .upload(storagePath, blob, { contentType: 'video/mp4', upsert: true });

      if (uploadError) throw uploadError;

      // upsert evita constraint violation em caso de retry após falha parcial
      const { error: dbError } = await supabase
        .from('interview_responses')
        .upsert(
          {
            candidate_id: candidate.id,
            question_id: currentQuestion.id,
            video_url: storagePath,
          },
          { onConflict: 'candidate_id,question_id' }
        );

      if (dbError) throw dbError;

      const nextIndex = currentIndex + 1;
      if (nextIndex >= questions.length) {
        navigation.replace('InterviewComplete', { candidate });
      } else {
        setCurrentIndex(nextIndex);
        setRecordingState('idle');
        setRecordedUri(null);
        setRecordingSeconds(0);
      }
    } catch {
      Alert.alert(
        'Erro ao enviar',
        'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.'
      );
      setRecordingState('recorded');
    }
  }

  if (loadingInit) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Carregando entrevista...</Text>
      </View>
    );
  }

  if (questions.length === 0) return null;

  const showCamera = recordingState === 'camera_open' || recordingState === 'recording';

  return (
    <SafeAreaView style={styles.container}>
      {/* Barra de progresso */}
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>
          Pergunta {currentIndex + 1} de {questions.length}
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentIndex + 1) / questions.length) * 100}%` as any },
            ]}
          />
        </View>
      </View>

      {/* Vídeo da pergunta */}
      <View style={styles.questionVideoContainer}>
        {loadingVideo ? (
          <ActivityIndicator size="large" color="#FFF" />
        ) : questionVideoUrl ? (
          <>
            <Video
              ref={questionVideoRef}
              source={{ uri: questionVideoUrl }}
              style={styles.questionVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              useNativeControls={false}
            />
            <TouchableOpacity
              style={styles.replayButton}
              onPress={() => {
                questionVideoRef.current?.setPositionAsync(0);
                questionVideoRef.current?.playAsync();
              }}
            >
              <Ionicons name="refresh" size={14} color={COLORS.PRIMARY} />
              <Text style={styles.replayButtonText}>Assistir novamente</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.videoErrorText}>Vídeo não disponível</Text>
        )}
      </View>

      {/* Divisor */}
      <View style={styles.divider} />

      {/* Área de gravação */}
      <View style={styles.recordingArea}>
        {recordingState === 'idle' && (
          <TouchableOpacity style={styles.startRecordButton} onPress={handleStartRecording}>
            <Ionicons name="camera" size={44} color={COLORS.PRIMARY} />
            <Text style={styles.startRecordText}>Iniciar gravação</Text>
          </TouchableOpacity>
        )}

        {showCamera && (
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              mode="video"
              onCameraReady={handleCameraReady}
            />

            {recordingState === 'camera_open' && (
              <View style={styles.cameraOverlay}>
                <ActivityIndicator color="#FFF" size="large" />
                <Text style={styles.preparingText}>Preparando câmera...</Text>
              </View>
            )}

            {recordingState === 'recording' && (
              <View style={styles.recordingOverlay}>
                <View style={styles.timerBadge}>
                  <View style={styles.recDot} />
                  <Text style={styles.timerText}>{formatDuration(recordingSeconds)}</Text>
                </View>
                <TouchableOpacity style={styles.stopRecordButton} onPress={handleStopRecording}>
                  <Ionicons name="stop-circle" size={22} color="#FFF" />
                  <Text style={styles.stopRecordText}>Parar gravação</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {recordingState === 'recorded' && recordedUri && (
          <View style={styles.previewContainer}>
            <Video
              source={{ uri: recordedUri }}
              style={styles.previewVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              useNativeControls
            />
            <View style={styles.previewButtons}>
              <TouchableOpacity style={styles.rerecordButton} onPress={handleRerecord}>
                <Ionicons name="refresh" size={18} color={COLORS.PRIMARY} />
                <Text style={styles.rerecordText}>Regravar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={handleSendResponse}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.sendText}>Enviar resposta</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {recordingState === 'uploading' && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            <Text style={styles.uploadingText}>Enviando...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },

  // Progress
  progressHeader: {
    backgroundColor: COLORS.CARD,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT,
    textAlign: 'center',
    marginBottom: 10,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: COLORS.BORDER,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: 2,
  },

  // Question video
  questionVideoContainer: {
    height: SCREEN_HEIGHT * 0.27,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionVideo: {
    width: '100%',
    height: '100%',
  },
  replayButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 15,
    minHeight: 44,
  },
  replayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.PRIMARY,
  },
  videoErrorText: {
    color: '#888',
    fontSize: 14,
  },

  divider: {
    height: 2,
    backgroundColor: COLORS.PRIMARY,
    opacity: 0.4,
  },

  // Recording area
  recordingArea: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startRecordButton: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 32,
    paddingHorizontal: 48,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
    borderStyle: 'dashed',
  },
  startRecordText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.PRIMARY,
  },

  // Camera
  cameraContainer: {
    flex: 1,
    width: '100%',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 12,
  },
  preparingText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  recordingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  timerText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  stopRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  stopRecordText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Preview
  previewContainer: {
    flex: 1,
    width: '100%',
  },
  previewVideo: {
    flex: 1,
    width: '100%',
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  rerecordButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
  },
  rerecordText: {
    color: COLORS.PRIMARY,
    fontSize: 15,
    fontWeight: '700',
  },
  sendButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Uploading
  uploadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  uploadingText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
