/**
 * EmphasisText · 大字强调模式
 *
 * 「逐字浮现」打字机效果，与对话/旁白一致：
 *   - 单个 visibleCount 共享值从 0 平滑增长到总字数；
 *   - useAnimatedReaction 把整数进度推到 React state，逐字切片渲染；
 *   - startDelay 用于在 transition 黑幕淡入完成后再开始；
 *   - skipAnim=true 立即全显并触发 onAnimDone；
 *   - 全部文字浮现完成后触发 onAnimDone。
 *
 * 防抖动 / 防浮动：
 *   - 每层先渲染一份透明「幽灵」文字（line.slice 的完整内容）占好固定宽高，
 *     可见文字绝对定位覆盖其上、始终 textAlign:left 逐字浮现；
 *   - 因此无论 align 是 center / right，文字块整体位置固定、每个字落点固定、
 *     高度不随打字浮动，打字一律从左往右（与对话一致）。
 *
 * animKey 变化时在 render 阶段同步把共享值/state 归零，防止切帧闪现上一帧文字。
 */

import React, { useEffect, useRef, useState, useMemo } from 'react'
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native'
import Animated, {
  useSharedValue,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
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
  startDelay?: number
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

// 大字打字速度（毫秒/字），与对话旁白一致
const EMPH_PER_CHAR_MS = 50

// 字间距基准：默认字号 34 时 letterSpacing = 9，其余字号按比例缩放
const BASE_FONT_SIZE = 34
const BASE_LETTER_SPACING = 9

export default function EmphasisText({
  lines,
  color = 'white',
  align = 'center',
  fontSize = 34,
  lineHeight = 1.72,
  animKey,
  skipAnim = false,
  startDelay = 0,
  onAnimDone,
  style,
}: Props) {
  const colorStyle = COLOR_MAP[color]

  const [visibleChars, setVisibleChars] = useState(0)
  const visibleCount = useSharedValue(0)

  // 每行起始偏移 + 总字数（按阅读顺序排列，跨行连续打字）
  const { offsets, total } = useMemo(() => {
    const arr: number[] = []
    let acc = 0
    for (const line of lines) {
      arr.push(acc)
      acc += line.length
    }
    return { offsets: arr, total: acc }
  }, [lines])

  // ── render 阶段同步归零（防止切帧闪现上一帧文字） ──
  const prevAnimKeyRef = useRef<string | number | null>(null)
  if (prevAnimKeyRef.current !== animKey) {
    prevAnimKeyRef.current = animKey
    cancelAnimation(visibleCount)
    visibleCount.value = 0
    if (visibleChars !== 0) setVisibleChars(0)
  }

  // 共享值整数进度 → React state，驱动逐字切片渲染
  useAnimatedReaction(
    () => Math.round(visibleCount.value),
    (count, prev) => { if (count !== prev) runOnJS(setVisibleChars)(count) },
  )

  useEffect(() => {
    if (skipAnim) {
      // 取消尚在运行的动画，直接全显
      cancelAnimation(visibleCount)
      visibleCount.value = total
      setVisibleChars(total)
      onAnimDone?.()
      return
    }

    // 逐字浮现：startDelay 等待切页淡入，再以 EMPH_PER_CHAR_MS/字 推进到 total
    const duration = Math.max(total, 1) * EMPH_PER_CHAR_MS
    visibleCount.value = withDelay(
      startDelay,
      withTiming(
        total,
        { duration, easing: Easing.linear },
        (finished) => { if (finished && onAnimDone) runOnJS(onAnimDone)() },
      ),
    )
    return () => { cancelAnimation(visibleCount) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, skipAnim, startDelay, total])

  // 文字块整体在屏幕上的水平位置仍跟随 align；但打字一律从左往右、落点固定
  const alignSelf: ViewStyle['alignSelf'] =
    align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

  // 字间距随字号等比缩放（默认字号 34 → 9）
  const letterSpacing = BASE_LETTER_SPACING * (fontSize / BASE_FONT_SIZE)

  return (
    <View style={[styles.wrap, style]}>
      {lines.map((line, i) => {
        const start = offsets[i]
        const shown = Math.max(0, Math.min(line.length, visibleChars - start))
        const lh = fontSize * lineHeight
        return (
          <View
            key={i}
            style={[styles.lineBox, { alignSelf, minHeight: lh }]}
          >
            {/* 幽灵：按完整内容占好固定宽高，杜绝打字时尺寸/位置浮动 */}
            <Text
              pointerEvents="none"
              style={[
                styles.line,
                colorStyle,
                { fontSize, lineHeight: lh, letterSpacing, opacity: 0 },
              ]}
            >
              {line}
            </Text>
            {/* 可见：绝对覆盖在幽灵之上，始终左对齐逐字浮现 */}
            <Text
              style={[
                styles.line,
                colorStyle,
                { fontSize, lineHeight: lh, letterSpacing, textAlign: 'left', position: 'absolute', left: 0, top: 0, right: 0 },
              ]}
            >
              {line.slice(0, shown)}
            </Text>
          </View>
        )
      })}
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
    fontFamily: 'serif',
  },
  lineBox: {
    position: 'relative',
  },
})
