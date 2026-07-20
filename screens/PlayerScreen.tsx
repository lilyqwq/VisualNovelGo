/**
 * PlayerScreen · Session 3 + Session 5A.5
 *
 * Props mode  (frames passed): plays editor frames via useFrameResolver,
 *             shows back button when onExit is provided.
 * Fallback mode (no frames):   plays hardcoded TEST_FRAMES (regression use).
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  BackHandler,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  cancelAnimation,
  withTiming,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import DialogueBox from '../components/FrostUI/DialogueBox'
import EmphasisText from '../components/FrostUI/EmphasisText'
import AutoPlayButton from '../components/FrostUI/AutoPlayButton'
import { FROST } from '../constants/theme'
import { useFrameResolver, EditorFrame, FrameAssets } from '../hooks/useFrameResolver'

// ─────────────────────────────────────────────────
// Fallback frame type (hardcoded TEST_FRAMES only)
// ─────────────────────────────────────────────────
type DialogType = 'dialogue' | 'narration' | 'emphasis' | 'cutscene'

interface FallbackFrame {
  id: string
  dialogType: DialogType
  characterName?: string
  text?: string
  lines?: string[]
  bgColor: string
  emphasisColor?: 'white' | 'red' | 'black'
}

const TEST_FRAMES: FallbackFrame[] = [
  {
    id: 'f1',
    dialogType: 'narration',
    text: '夜深了。城市的喧嚣渐渐退去，只剩下风吹过树梢的声音，和远处隐约传来的钟声。',
    bgColor: '#1a0810',
  },
  {
    id: 'f2',
    dialogType: 'dialogue',
    characterName: '林　晓',
    text: '你为什么要这样做？我们还有别的选择的……难道你真的想好了吗？',
    bgColor: '#060810',
  },
  {
    id: 'f3',
    dialogType: 'dialogue',
    characterName: '我',
    text: '因为这是唯一的办法。',
    bgColor: '#060810',
  },
  {
    id: 'f4',
    dialogType: 'emphasis',
    lines: ['命运', '从这一刻', '改变'],
    emphasisColor: 'white',
    bgColor: '#07040e',
  },
  {
    id: 'f5',
    dialogType: 'emphasis',
    lines: ['一切', '就此终结'],
    emphasisColor: 'red',
    bgColor: '#0e0408',
  },
  {
    id: 'f6',
    dialogType: 'narration',
    text: '他转过身，消失在夜色中。没有回头，没有告别。',
    bgColor: '#060810',
  },
]

// ─────────────────────────────────────────────────
// Normalised render shape (unified from both modes)
// ─────────────────────────────────────────────────
interface RenderFrame {
  id: string
  dialogType: DialogType
  fullText: string        // displayed text for dialogue / narration
  lines: string[]         // for emphasis
  characterName: string | null
  bgUri: string | null    // image background
  bgColor: string         // solid fallback color
  spriteUri: string | null
  spriteOverride: { scale: number; offsetX: number; offsetY: number } | null
  emphasisColor: 'white' | 'red' | 'black'
  emphasisFontSize: number
  emphasisLineHeight: number
  emphasisAlign: 'center' | 'left' | 'right'
  dialogFontSize: number
  transition: boolean     // fade-to-black transition before this frame
  cutsceneDuration: number
}

function buildFallback(f: FallbackFrame): RenderFrame {
  return {
    id: f.id,
    dialogType: f.dialogType,
    fullText: f.text ?? '',
    lines: f.lines ?? [],
    characterName: f.characterName ?? null,
    bgUri: null,
    bgColor: f.bgColor,
    spriteUri: null,
    spriteOverride: null,
    emphasisColor: f.emphasisColor ?? 'white',
    emphasisFontSize: 34,
    emphasisLineHeight: 1.72,
    emphasisAlign: 'center',
    dialogFontSize: 15,
    transition: false,
    cutsceneDuration: 3000,
  }
}

function buildFromEditor(f: EditorFrame, assets: FrameAssets): RenderFrame {
  return {
    id: f.id,
    dialogType: f.dialogType,
    fullText: f.dialogType !== 'emphasis' ? f.text : '',
    lines: f.dialogType === 'emphasis'
      ? f.text.split('\n').filter(Boolean)
      : [],
    characterName: assets.characterName,
    bgUri: assets.backgroundUri,
    bgColor: assets.backgroundColor ?? FROST.bg,
    spriteUri: assets.spriteUri,
    spriteOverride: f.spriteOverride,
    emphasisColor: f.emphasisColor ?? 'white',
    emphasisFontSize: f.emphasisFontSize ?? 34,
    emphasisLineHeight: f.emphasisLineHeight ?? 1.72,
    emphasisAlign: f.emphasisAlign ?? 'center',
    dialogFontSize: f.dialogFontSize ?? 15,
    transition: f.transition,
    cutsceneDuration: f.cutsceneDuration ?? 3000,
  }
}

// ─────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────
const STATUS_H     = StatusBar.currentHeight ?? 24
const { width: SW } = Dimensions.get('window')

// Sprite display width = 150% of screen width, horizontally centered
const SPRITE_SCALE = 1.5
const SPRITE_W     = Math.round(SW * SPRITE_SCALE)
const SPRITE_LEFT  = -Math.round((SPRITE_W - SW) / 2)   // negative → shifts left to center

// Cache computed heights so Image.getSize only fires once per URI
const spriteSizeCache: Record<string, number> = {}

function SceneBackground({ bgUri, bgColor }: { bgUri: string | null; bgColor: string }) {
  if (bgUri) {
    return <Image source={{ uri: bgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]}>
      <LinearGradient
        colors={['rgba(140,195,230,0.05)', 'transparent']}
        style={{ position: 'absolute', top: -100, left: -60, width: 320, height: 320, borderRadius: 160 }}
      />
    </View>
  )
}

function SpriteLayer({ spriteUri, spriteOverride }: {
  spriteUri: string | null
  spriteOverride: { scale: number; offsetX: number; offsetY: number } | null
}) {
  const [renderH, setRenderH] = useState<number | null>(
    spriteUri ? (spriteSizeCache[spriteUri] ?? null) : null,
  )

  useEffect(() => {
    if (!spriteUri) { setRenderH(null); return }
    if (spriteSizeCache[spriteUri] !== undefined) { setRenderH(spriteSizeCache[spriteUri]); return }
    Image.getSize(
      spriteUri,
      (w, h) => {
        const ch = Math.round(SPRITE_W * h / Math.max(1, w))
        spriteSizeCache[spriteUri] = ch
        setRenderH(ch)
      },
      () => {
        const ch = Math.round(SPRITE_W * 1.78)
        spriteSizeCache[spriteUri] = ch
        setRenderH(ch)
      },
    )
  }, [spriteUri])

  if (!spriteUri || renderH === null) return null

  const scale   = spriteOverride?.scale   ?? 1.0
  const offsetX = spriteOverride?.offsetX ?? 0
  const offsetY = spriteOverride?.offsetY ?? 0
  const actualW = Math.round(SPRITE_W * scale)
  const actualH = Math.round(renderH * scale)
  const actualLeft = -Math.round((actualW - SW) / 2) + offsetX

  return (
    <Image
      source={{ uri: spriteUri }}
      style={{ position: 'absolute', bottom: offsetY, left: actualLeft, width: actualW, height: actualH }}
      resizeMode="contain"
    />
  )
}

function BottomFade() {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(4,6,12,0.18)', 'rgba(4,6,12,0.44)', 'rgba(3,5,10,0.58)']}
      locations={[0, 0.35, 0.7, 1]}
      style={styles.bottomFade}
      pointerEvents="none"
    />
  )
}

function FrameDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots} pointerEvents="none">
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
      ))}
    </View>
  )
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.backBtn, { top: 36 }]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.backArrow}>‹</Text>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────
export interface PlayerProps {
  frames?: EditorFrame[]
  startIndex?: number
  onExit?: () => void
  autoPlayInterval?: number
}

// ─────────────────────────────────────────────────
// Main player
// ─────────────────────────────────────────────────
export default function PlayerScreen({ frames: propFrames, startIndex = 0, onExit, autoPlayInterval = 300 }: PlayerProps = {}) {
  const isEditorMode = propFrames !== undefined

  // Resolve assets only in editor mode (hook always called, empty array in fallback)
  const resolvedAssets = useFrameResolver(isEditorMode ? propFrames! : [])

  // Build normalised render frames
  const renderFrames: RenderFrame[] = isEditorMode
    ? propFrames!.map((f, i) => buildFromEditor(f, resolvedAssets[i] ?? {
        backgroundUri: null, backgroundColor: null, spriteUri: null, characterName: null,
      }))
    : TEST_FRAMES.map(buildFallback)

  const totalFrames = renderFrames.length

  const [currentIndex, setCurrentIndex] = useState(isEditorMode ? startIndex : 0)
  const [autoPlay, setAutoPlay]         = useState(false)
  const [visibleChars, setVisibleChars] = useState(0)
  const [animDone, setAnimDone]         = useState(false)
  const [emphSkip, setEmphSkip]         = useState(false)

  const visibleCount       = useSharedValue(0)
  const fadeOverlay        = useSharedValue(0)
  const dlgOpacity         = useSharedValue(0)   // starts hidden; fades in on each frame switch
  const animDoneRef        = useRef(false)
  const autoPlayRef        = useRef(false)
  const frameRef           = useRef(renderFrames[0])
  const renderFramesRef    = useRef(renderFrames)
  const currentIndexRef    = useRef(currentIndex)
  const autoTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const goNextRef          = useRef<(idx: number) => void>(() => {})

  renderFramesRef.current = renderFrames
  currentIndexRef.current = currentIndex

  useEffect(() => { animDoneRef.current = animDone }, [animDone])
  useEffect(() => { autoPlayRef.current = autoPlay }, [autoPlay])

  const onExitRef   = useRef(onExit)
  onExitRef.current = onExit
  useEffect(() => {
    if (!onExit) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExitRef.current?.()
      return true
    })
    return () => sub.remove()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onExit])

  const fadeOverlayStyle = useAnimatedStyle(() => ({
    opacity: fadeOverlay.value,
    backgroundColor: '#000',
  }))
  const dlgFadeStyle = useAnimatedStyle(() => ({ opacity: dlgOpacity.value }))

  const safeIdx   = Math.min(currentIndex, totalFrames - 1)
  const frame     = renderFrames[safeIdx]
  frameRef.current = frame

  const isLast = safeIdx >= totalFrames - 1

  useAnimatedReaction(
    () => Math.round(visibleCount.value),
    (count, prev) => { if (count !== prev) runOnJS(setVisibleChars)(count) },
  )

  const startAutoTimer = useCallback((f: RenderFrame) => {
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    let dwell: number
    if (f.dialogType === 'cutscene') {
      dwell = f.cutsceneDuration
    } else {
      const charCount =
        f.dialogType === 'emphasis'
          ? f.lines.join('').length
          : f.fullText.length
      dwell = Math.max(charCount * autoPlayInterval, 800)
    }
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null
      const idx = currentIndexRef.current
      if (idx >= totalFrames - 1) return
      goNextRef.current(idx + 1)
    }, dwell)
  }, [totalFrames, autoPlayInterval])

  const clearFrameEffects = useCallback(() => {
    cancelAnimation(visibleCount)
    cancelAnimation(dlgOpacity)
    dlgOpacity.value = 1   // snap visible if interrupted mid-fade
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }, [visibleCount, dlgOpacity])

  const onTypingDone = useCallback(() => {
    setAnimDone(true)
    if (autoPlayRef.current) startAutoTimer(frameRef.current)
  }, [startAutoTimer])

  const startTypingAnim = useCallback((f: RenderFrame, skip = false) => {
    const n = f.fullText.length
    visibleCount.value = 0
    setVisibleChars(0)
    setAnimDone(false)

    if (skip || n === 0) {
      visibleCount.value = n
      setVisibleChars(n)
      setAnimDone(true)
      if (autoPlayRef.current) startAutoTimer(f)
      return
    }

    visibleCount.value = withTiming(
      n,
      { duration: n * 50, easing: Easing.linear },
      (finished) => { if (finished) runOnJS(onTypingDone)() },
    )
  }, [onTypingDone, startAutoTimer, visibleCount])

  useEffect(() => {
    // 只在有对话框的帧淡入；emphasis 帧无需操作 dlgOpacity
    if (frame.dialogType !== 'emphasis') {
      dlgOpacity.value = withTiming(1, { duration: 180, easing: Easing.ease })
    }
    if (frame.dialogType === 'dialogue' || frame.dialogType === 'narration') {
      startTypingAnim(frame)
    } else if (frame.dialogType === 'cutscene') {
      visibleCount.value = 0
      setVisibleChars(0)
      setAnimDone(true)
      setEmphSkip(false)
      if (autoPlayRef.current) startAutoTimer(frame)
    } else {
      // emphasis
      visibleCount.value = 0
      setVisibleChars(0)
      setAnimDone(frame.lines.length === 0)
      setEmphSkip(false)
    }
    return clearFrameEffects
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIdx])

  useEffect(() => () => clearFrameEffects(), [clearFrameEffects])

  // Batch-reset all per-frame state + switch index in a single React render
  const applyFrameSwitch = useCallback((nextIdx: number) => {
    visibleCount.value = 0
    // 只在 emphasis ↔ 对话框 切换时才隐藏对话框，避免同类型切页时出现闪烁
    const currType = renderFramesRef.current[currentIndexRef.current]?.dialogType
    const nextType = renderFramesRef.current[nextIdx]?.dialogType
    if (currType === 'emphasis' || nextType === 'emphasis') {
      dlgOpacity.value = 0
    }
    setVisibleChars(0)
    setAnimDone(false)
    setEmphSkip(false)
    setCurrentIndex(nextIdx)
  }, [visibleCount, dlgOpacity])

  // Advance to nextIdx, with optional fade-to-black when target frame has transition:true
  const goNext = useCallback((nextIdx: number) => {
    const nextFrame = renderFramesRef.current[nextIdx]
    if (nextFrame?.transition) {
      fadeOverlay.value = withTiming(1, { duration: 150, easing: Easing.linear }, () => {
        runOnJS(applyFrameSwitch)(nextIdx)
        fadeOverlay.value = withTiming(0, { duration: 300, easing: Easing.linear })
      })
    } else {
      applyFrameSwitch(nextIdx)
    }
  }, [fadeOverlay, applyFrameSwitch])

  goNextRef.current = goNext

  const handleTap = useCallback(() => {
    if (!animDoneRef.current) {
      clearFrameEffects()
      if (frame.dialogType === 'dialogue' || frame.dialogType === 'narration') {
        const n = frame.fullText.length
        visibleCount.value = n
        setVisibleChars(n)
        setAnimDone(true)
        if (autoPlayRef.current) startAutoTimer(frame)
      } else {
        if (frame.lines.length === 0) {
          setAnimDone(true)
        } else {
          setEmphSkip(true)
        }
      }
    } else {
      if (isLast) {
        onExit?.()
        return
      }
      if (autoTimerRef.current !== null) {
        clearTimeout(autoTimerRef.current)
        autoTimerRef.current = null
      }
      goNext(safeIdx + 1)
    }
  }, [frame, isLast, onExit, clearFrameEffects, startAutoTimer, visibleCount, goNext, safeIdx])

  const handleAutoToggle = useCallback(() => {
    setAutoPlay(prev => {
      const next = !prev
      autoPlayRef.current = next
      if (next) {
        if (animDoneRef.current) startAutoTimer(frameRef.current)
      } else {
        if (autoTimerRef.current !== null) {
          clearTimeout(autoTimerRef.current)
          autoTimerRef.current = null
        }
      }
      return next
    })
  }, [startAutoTimer])

  const handleEmphAnimDone = useCallback(() => {
    setAnimDone(true)
    if (autoPlayRef.current) startAutoTimer(frameRef.current)
  }, [startAutoTimer])

  const displayText = frame.fullText.slice(0, visibleChars)

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.screen}>
        <StatusBar hidden />

        {/* ① 背景 */}
        <SceneBackground bgUri={frame.bgUri} bgColor={frame.bgColor} />

        {/* ② 立绘 */}
        <SpriteLayer spriteUri={frame.spriteUri} spriteOverride={frame.spriteOverride} />

        {/* ③ 底部渐出 */}
        <BottomFade />

        {/* ④ 自动播放键 */}
        <AutoPlayButton active={autoPlay} onToggle={handleAutoToggle} />

        {/* ⑥ 返回键（仅 onExit 模式） */}
        {onExit && <BackButton onPress={onExit} />}

        {/* ⑦ 切页黑幕（transition 动画用） */}
        <Animated.View
          style={[StyleSheet.absoluteFill, fadeOverlayStyle]}
          pointerEvents="none"
        />

        {/* ⑧ 对话框层 — 统一组件，BlurView 在 dialogue/narration 间持续挂载 */}
        <Animated.View style={[styles.dlgLayer, dlgFadeStyle]} pointerEvents="none">
          {(frame.dialogType === 'dialogue' || frame.dialogType === 'narration') && (
            <DialogueBox
              dialogType={frame.dialogType}
              characterName={frame.characterName}
              visibleText={displayText}
              animDone={animDone}
              fontSize={frame.dialogFontSize}
            />
          )}
        </Animated.View>

        {/* ⑨ 大字模式 */}
        {frame.dialogType === 'emphasis' && frame.lines.length > 0 && (
          <EmphasisText
            lines={frame.lines}
            color={frame.emphasisColor}
            align={frame.emphasisAlign}
            fontSize={frame.emphasisFontSize}
            lineHeight={frame.emphasisLineHeight}
            animKey={frame.id}
            skipAnim={emphSkip}
            onAnimDone={handleEmphAnimDone}
          />
        )}
      </View>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: FROST.bg,
  },

  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
  },

  dlgLayer: {
    position: 'absolute',
    bottom: FROST.dlgBottom,
    left: 0,
    right: 0,
  },

  dots: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(200,228,242,0.18)',
  },
  dotActive: {
    backgroundColor: 'rgba(200,228,242,0.70)',
    width: 12,
  },

  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(3,5,10,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(210,235,248,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  backArrow: {
    fontSize: 22,
    color: 'rgba(210,235,248,0.7)',
    lineHeight: 26,
    marginTop: -1,
  },
})
