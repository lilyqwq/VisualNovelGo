/**
 * EmphasisText · 大字强调模式
 *
 * 每行 opacity 0→1，时长 400ms，行间间隔 200ms。
 * animKey 变化时重新执行动画；skipAnim=true 立即全显。
 * 最后一行淡入完成后调用 onAnimDone。
 *
 * 关键设计：animKey 变化时在 render 阶段同步把 shared value
 * 归零，而不是等 useEffect，避免切帧那一帧 opacity 仍为 1
 * 导致内容一闪而过。
 */

import React, { useEffect, useRef } from 'react'
import { View, StyleSheet, ViewStyle, TextStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated'

export type EmphasisColor = 'white' | 'red' | 'black'
export type EmphasisAlign = 'center' | 'left' | 'right'

interface Props {
  lines: string[]
  color?: EmphasisColor
  align?: EmphasisAlign
  fontSize?: number
  lineHeight?: number
  animKey: string | number
  skipAnim?: boolean
  onAnimDone?: () => void
  style?: ViewStyle
}

const COLOR_MAP: Record<EmphasisColor, TextStyle> = {
  white: {
    color: '#ffffff',
    textShadowColor: 'rgba(200,232,250,0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 28,
  },
  red: {
    color: '#ff4444',
    textShadowColor: 'rgba(255,80,60,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  black: { color: '#0a0a0a' },
}

const ALIGN_MAP: Record<EmphasisAlign, TextStyle['textAlign']> = {
  center: 'center',
  left: 'left',
  right: 'right',
}

function EmphLine({
  text,
  colorStyle,
  textAlign,
  fontSize,
  lineHeight,
  opacity,
}: {
  text: string
  colorStyle: TextStyle
  textAlign: TextStyle['textAlign']
  fontSize: number
  lineHeight: number
  opacity: Animated.SharedValue<number>
}) {
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.Text
      style={[
        styles.line,
        colorStyle,
        { fontSize, lineHeight: fontSize * lineHeight, textAlign },
        animStyle,
      ]}
    >
      {text}
    </Animated.Text>
  )
}

// 固定 8 个 shared value（钩子数量不能动态变化）
export default function EmphasisText({
  lines,
  color = 'white',
  align = 'center',
  fontSize = 34,
  lineHeight = 1.72,
  animKey,
  skipAnim = false,
  onAnimDone,
  style,
}: Props) {
  const colorStyle = COLOR_MAP[color]
  const textAlign = ALIGN_MAP[align]

  const op0 = useSharedValue(0)
  const op1 = useSharedValue(0)
  const op2 = useSharedValue(0)
  const op3 = useSharedValue(0)
  const op4 = useSharedValue(0)
  const op5 = useSharedValue(0)
  const op6 = useSharedValue(0)
  const op7 = useSharedValue(0)
  const allOps = [op0, op1, op2, op3, op4, op5, op6, op7]

  // ── render 阶段同步归零（防止切帧闪烁） ────────────
  // useEffect 在绘制后才执行；若在此处等 effect 再归零，
  // 切帧时那一帧会用旧值（=1）绘制，造成一闪而过。
  // 用 ref 追踪 animKey 变化，在 render 内立即重置。
  const prevAnimKeyRef = useRef<string | number | null>(null)
  if (prevAnimKeyRef.current !== animKey) {
    prevAnimKeyRef.current = animKey
    for (const op of allOps) {
      cancelAnimation(op)
      op.value = 0
    }
  }

  // ── 动画启动（在 effect 里，paint 后执行无妨） ────
  useEffect(() => {
    const n = Math.min(lines.length, allOps.length)

    if (skipAnim) {
      // 取消尚在运行的动画，直接全显
      for (const op of allOps) cancelAnimation(op)
      for (let i = 0; i < n; i++) allOps[i].value = 1
      onAnimDone?.()
      return
    }

    // animKey 变化时 op 已在 render 阶段归零，直接启动淡入
    const FADE_DUR = 400
    const GAP = 200
    const tids: ReturnType<typeof setTimeout>[] = []

    for (let i = 0; i < n; i++) {
      const delay = i * (FADE_DUR + GAP)
      const isLast = i === n - 1
      const op = allOps[i]

      const tid = setTimeout(() => {
        if (isLast && onAnimDone) {
          op.value = withTiming(
            1,
            { duration: FADE_DUR, easing: Easing.out(Easing.quad) },
            (finished) => { if (finished) runOnJS(onAnimDone)() },
          )
        } else {
          op.value = withTiming(1, { duration: FADE_DUR, easing: Easing.out(Easing.quad) })
        }
      }, delay)

      tids.push(tid)
    }

    return () => {
      for (const tid of tids) clearTimeout(tid)
      for (const op of allOps) cancelAnimation(op)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, skipAnim])

  const containerAlign = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

  return (
    <View style={[styles.wrap, style, { alignItems: containerAlign }]}>
      {lines.map((line, i) => (
        <EmphLine
          key={i}
          text={line}
          colorStyle={colorStyle}
          textAlign={textAlign}
          fontSize={fontSize}
          lineHeight={lineHeight}
          opacity={allOps[i]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 44,
    paddingVertical: 50,
  },
  line: {
    fontWeight: '600',
    letterSpacing: 9,
    fontFamily: 'serif',
  },
})
