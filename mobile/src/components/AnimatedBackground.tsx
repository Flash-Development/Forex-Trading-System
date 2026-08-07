// Performance-optimised animated background.
// Uses only opacity animations with useNativeDriver: true so zero JS-thread
// work happens per frame. Positions are static; reduced from 5 to 3 orbs.
import React, { useEffect, useRef, memo } from 'react'
import { Animated, Dimensions, StyleSheet, View } from 'react-native'

const { width: W, height: H } = Dimensions.get('window')

interface Orb {
  opacity: Animated.Value
  style: {
    width: number
    height: number
    borderRadius: number
    backgroundColor: string
    left: number
    top: number
  }
  duration: number
  delay: number
}

const ORBS: Orb[] = [
  {
    opacity: new Animated.Value(0),
    style: { width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(59,130,246,0.15)', left: -80, top: H * 0.1 },
    duration: 5000, delay: 0,
  },
  {
    opacity: new Animated.Value(0),
    style: { width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(34,211,238,0.10)', left: W * 0.55, top: H * 0.4 },
    duration: 6500, delay: 1500,
  },
  {
    opacity: new Animated.Value(0),
    style: { width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(96,165,250,0.08)', left: W * 0.2, top: H * 0.65 },
    duration: 7000, delay: 3000,
  },
]

function startOrb(orb: Orb) {
  Animated.loop(
    Animated.sequence([
      Animated.delay(orb.delay),
      Animated.timing(orb.opacity, { toValue: 1, duration: orb.duration, useNativeDriver: true }),
      Animated.timing(orb.opacity, { toValue: 0, duration: orb.duration, useNativeDriver: true }),
    ])
  ).start()
}

export const AnimatedBackground = memo(function AnimatedBackground() {
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ORBS.forEach(startOrb)
  }, [])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ORBS.map((orb, i) => (
        <Animated.View
          key={i}
          style={[
            StyleSheet.absoluteFillObject,
            orb.style,
            { opacity: orb.opacity, position: 'absolute' },
          ]}
        />
      ))}
    </View>
  )
})
