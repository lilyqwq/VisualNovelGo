/**
 * NarrationBox · 旁白对话框
 *
 * props 新增：
 *  - visibleText  受控显示文本
 *  - animDone     文字全部显示后为 true，触发 ▼ bob
 */

import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated'
import { FROST } from '../../constants/theme'

interface Props {
  visibleText: string
  animDone: boolean
  fontSize?: number
  style?: ViewStyle
}

// ── 顶部旁白装饰 ─────────────────────────────────
function NarrTopDeco() {
  return (
    <View style={styles.topDecoWrap} pointerEvents="none">
      <LinearGradient
        colors={[
          'rgba(210,235,248,0)',
          'rgba(210,235,248,0.42)',
          'rgba(230,248,255,0.60)',
          'rgba(210,235,248,0.42)',
          'rgba(210,235,248,0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLine}
      />
      <LinearGradient
        colors={[
          'rgba(210,235,248,0)',
          'rgba(210,235,248,0.14)',
          'rgba(210,235,248,0.22)',
          'rgba(210,235,248,0.14)',
          'rgba(210,235,248,0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLine2}
      />
      <View style={styles.narrDeco} />
      <View style={[styles.tick, styles.tickL]} />
      <View style={[styles.tick, styles.tickR]} />
    </View>
  )
}

// ── 两侧渐隐 ──────────────────────────────────────
function SideMasks() {
  return (
    <>
      <LinearGradient
        colors={['rgba(3,5,10,1)', 'rgba(3,5,10,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.maskLeft}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(3,5,10,0)', 'rgba(3,5,10,1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.maskRight}
        pointerEvents="none"
      />
    </>
  )
}

// ── ▼ bob 动画箭头 ────────────────────────────────
function ArrBob({ active }: { active: boolean }) {
  const translateY = useSharedValue(0)
  const opacity    = useSharedValue(0)

  useEffect(() => {
    if (active) {
      opacity.value = withTiming(1, { duration: 200 })
      translateY.value = withRepeat(
        withSequence(
          withTiming(3, { duration: 650, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      )
    } else {
      cancelAnimation(translateY)
      cancelAnimation(opacity)
      translateY.value = 0
      opacity.value = 0
    }
  }, [active])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.Text style={[styles.arr, animStyle]}>▼</Animated.Text>
  )
}

export default function NarrationBox({ visibleText, animDone, fontSize, style }: Props) {
  const fs = fontSize ?? 15
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.bodyOuter}>
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: FROST.narrBg }]} />
        <NarrTopDeco />
        <View style={styles.bodyInner}>
          <Text style={[styles.text, { fontSize: fs, lineHeight: fs * 1.95 }]}>{visibleText}</Text>
          <View style={styles.foot}>
            <ArrBob active={animDone} />
          </View>
        </View>
        <SideMasks />
      </View>
    </View>
  )
}

const MASK_W = FROST.maskWidth

const styles = StyleSheet.create({
  wrap: {},
  bodyOuter: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 120,
  },

  topDecoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 16,
    alignItems: 'center',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
  },
  topLine2: {
    position: 'absolute',
    top: 4,
    left: 56,
    right: 56,
    height: 1,
  },
  narrDeco: {
    position: 'absolute',
    top: -4,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: 'rgba(210,235,248,0.45)',
    backgroundColor: 'rgba(3,5,10,0.65)',
    transform: [{ rotate: '45deg' }],
  },
  tick: {
    position: 'absolute',
    top: -3,
    width: 1,
    height: 6,
    backgroundColor: 'rgba(210,235,248,0.32)',
  },
  tickL: { left: 46 },
  tickR: { right: 46 },

  bodyInner: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: FROST.dlgPadH,
  },
  text: {
    fontSize: 14,
    lineHeight: 14 * 1.95,
    letterSpacing: 1,
    color: FROST.textMain,
    fontFamily: 'serif',
    minHeight: 90,
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  arr: {
    color: '#c0dff0',
    fontSize: 10,
  },

  maskLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: MASK_W,
  },
  maskRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: MASK_W,
  },
})
