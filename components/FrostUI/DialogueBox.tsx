/**
 * DialogueBox · 统一对话框（对白 + 旁白）
 *
 * dialogType = 'dialogue' → 显示角色名栏 + 对白装饰顶线
 * dialogType = 'narration' → 名字栏占位但不可见 + 旁白装饰顶线
 *
 * 两种模式共用同一套水平渐变玻璃（左右渐隐至透明），切换时无需重新挂载，衔接更丝滑。
 */

import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Polygon } from 'react-native-svg'
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
  dialogType: 'dialogue' | 'narration'
  characterName: string | null
  visibleText: string
  animDone: boolean
  fontSize?: number
  style?: ViewStyle
}

// ── 菱形装饰（SVG） ──────────────────────────────
function GemDiamond({ size = 7, color = FROST.iceBlue }: { size?: number; color?: string }) {
  const h = size
  const w = size
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Polygon
        points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
        fill={color}
      />
    </Svg>
  )
}

// ── 对白顶部装饰（主线 + 辅线 + 中心冠） ─────────
function DialogueTopDeco() {
  return (
    <View style={styles.topDecoWrap} pointerEvents="none">
      <LinearGradient
        colors={[
          FROST.lineStop0,
          FROST.lineStop1,
          FROST.lineStop2,
          FROST.lineStop1,
          FROST.lineStop0,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLine}
      />
      <LinearGradient
        colors={[
          'rgba(210,235,248,0)',
          'rgba(210,235,248,0.16)',
          'rgba(210,235,248,0.24)',
          'rgba(210,235,248,0.16)',
          'rgba(210,235,248,0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLine2}
      />
      <View style={styles.crownRow}>
        <View style={[styles.crownTick, { transform: [{ scaleX: -1 }] }]} />
        <GemDiamond size={7} />
        <View style={styles.crownTick} />
      </View>
    </View>
  )
}

// ── 旁白顶部装饰（旋转方块 + 刻度线） ────────────
function NarrationTopDeco() {
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

// ── 右上角切角（仅对白模式） ─────────────────────
function CornerCut() {
  return (
    <View style={styles.cornerCut} pointerEvents="none">
      <Svg width={10} height={10} viewBox="0 0 10 10">
        <Polygon points="0,0 10,0 0,10" fill="rgba(210,235,248,0.32)" />
      </Svg>
    </View>
  )
}

// ── 名字板（无边框柔光底 + 左右渐隐） ──
function NameBar({ name }: { name: string }) {
  return (
    <View style={styles.namebarWrap}>
      <LinearGradient
        colors={['rgba(3,6,12,0)', 'rgba(3,6,12,0.55)', 'rgba(3,6,12,0.55)', 'rgba(3,6,12,0)']}
        locations={[0, 0.12, 0.88, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.namebarPill}
      >
        <GemDiamond size={5} color={FROST.iceBlueDim} />
        <Text style={styles.namebarText}>{name}</Text>
      </LinearGradient>
    </View>
  )
}

// ── ▶ bob 动画箭头 ────────────────────────────────
function ArrBob({ active }: { active: boolean }) {
  const translateX = useSharedValue(0)
  const opacity    = useSharedValue(0)

  useEffect(() => {
    if (active) {
      opacity.value = withTiming(1, { duration: 200 })
      translateX.value = withRepeat(
        withSequence(
          withTiming(3, { duration: 650, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      )
    } else {
      cancelAnimation(translateX)
      cancelAnimation(opacity)
      translateX.value = 0
      opacity.value = 0
    }
  }, [active])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.Text style={[styles.arr, animStyle]}>▶</Animated.Text>
  )
}

// ── 主组件 ────────────────────────────────────────
export default function DialogueBox({ dialogType, characterName, visibleText, animDone, fontSize, style }: Props) {
  const isDialogue = dialogType === 'dialogue'
  const fs = fontSize ?? 15
  return (
    <View style={[styles.wrap, style]}>
      {/* NameBar 始终占位；旁白模式 opacity:0 隐藏但保留高度，避免切换时 body 上跳 */}
      <View style={{ opacity: isDialogue ? 1 : 0 }}>
        <NameBar name={characterName ?? ''} />
      </View>

      <View style={styles.bodyOuter}>
        <LinearGradient
          colors={isDialogue
            ? ['rgba(3,6,12,0)', 'rgba(3,6,12,0.55)', 'rgba(3,6,12,0.55)', 'rgba(3,6,12,0)']
            : ['rgba(3,6,12,0)', 'rgba(3,6,12,0.5)', 'rgba(3,6,12,0.5)', 'rgba(3,6,12,0)']}
          locations={[0, 0.12, 0.88, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />

        {isDialogue ? <DialogueTopDeco /> : <NarrationTopDeco />}
        {isDialogue && <CornerCut />}

        <View style={styles.bodyInner}>
          <Text style={[styles.text, { fontSize: fs, lineHeight: fs * 1.95 }]}>{visibleText}</Text>
          <View style={styles.foot}>
            <ArrBob active={animDone} />
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {},

  // ── NameBar ────────────────────────────────────
  namebarWrap: {
    marginLeft: 32,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  namebarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 16,
    paddingRight: 24,
    paddingVertical: 5,
    borderRadius: 8,
  },
  namebarText: {
    fontSize: 14,
    letterSpacing: 2.5,
    fontWeight: '600',
    color: FROST.namebar,
    fontFamily: 'serif',
  },

  // ── Body ───────────────────────────────────────
  bodyOuter: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 120,
  },
  bodyInner: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: FROST.dlgPadH,
  },
  text: {
    fontSize: 15,
    lineHeight: 15 * 1.95,
    letterSpacing: 0.8,
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

  // ── Shared top decoration layout ───────────────
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

  // ── Dialogue-specific decoration ───────────────
  crownRow: {
    position: 'absolute',
    top: -3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  crownTick: {
    width: 20,
    height: 1,
    backgroundColor: 'rgba(210,235,248,0.45)',
  },
  cornerCut: {
    position: 'absolute',
    top: 0,
    right: 28,
  },

  // ── Narration-specific decoration ──────────────
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
})
