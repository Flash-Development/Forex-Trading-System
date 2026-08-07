import React from 'react'
import { Image, StyleSheet, ImageStyle, StyleProp } from 'react-native'

interface Props {
  size?: number
  style?: StyleProp<ImageStyle>
}

export function BrandLogo({ size = 40, style }: Props) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={[{ width: size, height: size }, styles.base, style]}
      resizeMode="contain"
      accessibilityLabel="FTS logo"
    />
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
  },
})
