import React, { useEffect, useRef } from 'react'
import { View, Image, Animated, StyleSheet, Dimensions } from 'react-native'
import { colors } from '../theme'

const { width } = Dimensions.get('window')
const LOGO_SIZE = width * 0.38

interface Props {
  onFinish: () => void
}

export function SplashScreen({ onFinish }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.8)).current
  const glowOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      // Fade + scale in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      // Glow pulse
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Hold
      Animated.delay(700),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish())
  }, [])

  return (
    <View style={styles.container}>
      {/* Glow ring behind logo */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  glow: {
    position: 'absolute',
    width: LOGO_SIZE * 1.6,
    height: LOGO_SIZE * 1.6,
    borderRadius: LOGO_SIZE * 0.8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
})
