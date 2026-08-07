import React from 'react'
import { ScrollView, View, Text, StyleSheet, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fontSize, fontWeight, spacing } from '../../theme'

interface ScreenLayoutProps {
  title: string
  children: React.ReactNode
  scrollable?: boolean
  contentStyle?: ViewStyle
}

export function ScreenLayout({ title, children, scrollable = true, contentStyle }: ScreenLayoutProps) {
  const content = (
    <View style={[styles.content, contentStyle]}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: spacing[4],
  },
  title: {
    color: colors.gold,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginBottom: spacing[4],
  },
})
