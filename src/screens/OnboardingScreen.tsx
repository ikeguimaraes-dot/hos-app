import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../lib/types';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = '@hos_onboarding_done';

const slides = [
  {
    key: '1',
    icon: 'leaf-outline' as const,
    title: 'Bem-vindo ao HOS',
    subtitle: 'Seu app de trabalho.\nSimples assim.',
    bg: COLORS.CARVAO,
    textColor: COLORS.CREME,
  },
  {
    key: '2',
    icon: 'camera-outline' as const,
    title: 'Bata seu ponto aqui',
    subtitle: 'Selfie + GPS.\nEm segundos.',
    bg: COLORS.PRIMARY,
    textColor: '#FFFFFF',
  },
  {
    key: '3',
    icon: 'grid-outline' as const,
    title: 'Tudo que você precisa',
    subtitle: 'Holerites · Banco de Horas · Ranking.\nNa palma da mão.',
    bg: COLORS.CARVAO,
    textColor: COLORS.CREME,
  },
  {
    key: '4',
    icon: 'checkmark-circle-outline' as const,
    title: 'Pronto para começar',
    subtitle: 'Hospitalidade por método.',
    bg: '#1A1A1A',
    textColor: COLORS.CREME,
    cta: true,
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'done');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  function next() {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  }

  const bg = scrollX.interpolate({
    inputRange: slides.map((_, i) => i * width),
    outputRange: slides.map(s => s.bg),
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={s => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={e => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Ionicons name={item.icon} size={96} color={item.textColor} style={styles.icon} />
            <Text style={[styles.title, { color: item.textColor }]}>{item.title}</Text>
            <Text style={[styles.subtitle, { color: item.textColor }]}>{item.subtitle}</Text>

            {item.cta && (
              <TouchableOpacity style={styles.ctaButton} onPress={finish} activeOpacity={0.85}>
                <Text style={styles.ctaText}>Entrar no HOS</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {slides.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          const scale = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [0.8, 1.2, 0.8],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { opacity, transform: [{ scale }] }]}
            />
          );
        })}
      </View>

      {/* Next / Skip */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>
        {currentIndex < slides.length - 1 && (
          <TouchableOpacity onPress={next} style={styles.nextBtn} activeOpacity={0.85}>
            <Ionicons name="arrow-forward" size={22} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    paddingBottom: 160,
  },
  icon: {
    marginBottom: 32,
    opacity: 0.9,
  },
  title: {
    fontSize: 34,
    fontFamily: 'Fraunces_700Bold',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'InstrumentSans_400Regular',
    textAlign: 'center',
    lineHeight: 28,
    opacity: 0.8,
  },
  ctaButton: {
    marginTop: 48,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 17,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  dots: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.CREME,
  },
  footer: {
    position: 'absolute',
    bottom: 52,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: {
    padding: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'InstrumentSans_400Regular',
    color: COLORS.CREME,
    opacity: 0.6,
  },
  nextBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
