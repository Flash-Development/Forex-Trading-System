import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "@/theme";

function LiveDot({ running }: { running: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!running) { pulse.setValue(1); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [running])

  return (
    <View style={styles.wrap}>
      {running && (
        <Animated.View
          style={[styles.ring, { transform: [{ scale: pulse }], opacity: pulse.interpolate({ inputRange: [1, 1.8], outputRange: [0.5, 0] }) }]}
        />
      )}
      <View style={[styles.dot, { backgroundColor: running ? colors.green : colors.textDisabled }]} />
    </View>
  )
}

export default LiveDot;

const styles = StyleSheet.create({
  wrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, position: 'absolute' },
  ring: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.green,
  },
})
