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
  type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  cancelAnimation,
  withTiming,
  withDelay,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import DialogueBox from '../components/FrostUI/DialogueBox'
import EmphasisText from '../components/FrostUI/EmphasisText'
import AutoPlayButton from '../components/FrostUI/AutoPlayButton'
import { FROST } from '../constants/theme'
import { useFrameResolver, EditorFrame, FrameAssets, type AspectRatio } from '../hooks/useFrameResolver'

// ─────────────────────────────────────────────────
// 自动播放停留时长：按「阅读单元」估算
//   CJK 字符（含假名 / 全角）每字 1 单位；连续拉丁字母或数字每「词」加权
//   LATIN_WORD_WEIGHT；空格与半角标点不计。解决英文按字母计导致停留过长的问题。
// ─────────────────────────────────────────────────
const LATIN_WORD_WEIGHT = 1.5

// 切页黑幕淡出时长（与 goNext 中 fadeOverlay 淡出一致）。
// 带 transition 的帧：新画面在黑幕淡出完成（此值）后才完全可见，
// 因此文字/大字段的播放需延迟此值，避免"画面还在淡入就开始打字"。
const FADE_OUT_MS = 300

function estimateReadUnits(text: string): number {
  let units = 0
  const cjk = text.match(/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uFF00-\uFFEF]/g)
  if (cjk) units += cjk.length
  const latin = text.match(/[A-Za-z0-9'’-]+/g)
  if (latin) units += latin.length * LATIN_WORD_WEIGHT
  return units
}

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
const { width: SW, height: SH } = Dimensions.get('window')

// 立绘基准高度 = 场景高 × 该系数，脚底贴场景底边（全画幅自动等比缩放）
const SPRITE_FILL = 0.9
// 缓存每张立绘的宽高比 w/h，避免重复 Image.getSize
const spriteArCache: Record<string, number> = {}

function SceneBackground({ bgUri, bgColor }: { bgUri: string | null; bgColor: string }) {
  if (bgUri) {
    // resizeMode cover → 在任意目标画幅容器内自动居中裁剪（9:16 / 全屏 / 3:4）
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

function SpriteLayer({ spriteUri, spriteOverride, sceneHeight }: {
  spriteUri: string | null
  spriteOverride: { scale: number; offsetX: number; offsetY: number } | null
  sceneHeight: number
}) {
  const [ar, setAr] = useState<number | null>(
    spriteUri ? (spriteArCache[spriteUri] ?? null) : null,
  )

  useEffect(() => {
    if (!spriteUri) { setAr(null); return }
    if (spriteArCache[spriteUri] !== undefined) { setAr(spriteArCache[spriteUri]); return }
    Image.getSize(
      spriteUri,
      (w, h) => {
        const r = w / Math.max(1, h)
        spriteArCache[spriteUri] = r
        setAr(r)
      },
      () => {
        const r = 1 / 1.78
        spriteArCache[spriteUri] = r
        setAr(r)
      },
    )
  }, [spriteUri])

  if (!spriteUri || ar === null) return null

  const scale   = spriteOverride?.scale   ?? 1.0
  const offsetX = spriteOverride?.offsetX ?? 0
  const offsetY = spriteOverride?.offsetY ?? 0
  const baseH   = sceneHeight * SPRITE_FILL
  const baseW   = baseH * ar
  const actualW = Math.round(baseW * scale)
  const actualH = Math.round(baseH * scale)
  const actualLeft = -Math.round((actualW - SW) / 2) + offsetX

  return (
    <Image
      source={{ uri: spriteUri }}
      style={{ position: 'absolute', bottom: offsetY, left: actualLeft, width: actualW, height: actualH }}
      resizeMode="contain"
    />
  )
}

function BottomFade({ sceneHeight }: { sceneHeight: number }) {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(4,6,12,0.18)', 'rgba(4,6,12,0.44)', 'rgba(3,5,10,0.58)']}
      locations={[0, 0.35, 0.7, 1]}
      style={[styles.bottomFade, { height: Math.min(280, sceneHeight * 0.5) }]}
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
  minDwell?: number
  aspect?: AspectRatio
}

// ─────────────────────────────────────────────────
// Main player
// ─────────────────────────────────────────────────
export default function PlayerScreen({ frames: propFrames, startIndex = 0, onExit, autoPlayInterval = 300, minDwell = 1500, aspect = 'full' }: PlayerProps = {}) {
  const isEditorMode = propFrames !== undefined

  // 场景容器尺寸：全屏铺满；9:16 / 3:4 在竖屏机上表现为上下黑边、宽度 = 屏宽
  const ratioVal = aspect === '9:16' ? 16 / 9 : aspect === '3:4' ? 4 / 3 : null
  const sceneH   = ratioVal ? Math.min(SW * ratioVal, SH) : SH
  const sceneStyle: ViewStyle = { width: SW, height: sceneH, alignSelf: 'center', overflow: 'hidden' }
  // 对话框高度按画幅等比缩放：以 9:16 场景高为基准 1.0（3:4 更矮、全屏更高）
  const boxScale = sceneH / (SW * 16 / 9)

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
  // 标记「当前帧是通过 transition 黑幕淡入进入的」，供主 effect 决定播放延迟
  const enteredViaFadeRef  = useRef(false)

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

  // 当前帧是否经由 transition 黑幕淡入进入：goNext 在切换时设置该 ref，
  // 渲染期据此决定文字/大字的播放延迟（FADE_OUT_MS），确保画面完全切入后再播放
  const fadeInDelay = enteredViaFadeRef.current ? FADE_OUT_MS : 0

  useAnimatedReaction(
    () => Math.round(visibleCount.value),
    (count, prev) => { if (count !== prev) runOnJS(setVisibleChars)(count) },
  )

  const startAutoTimer = useCallback((f: RenderFrame, preDelay = 0) => {
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    let dwell: number
    if (f.dialogType === 'cutscene') {
      dwell = f.cutsceneDuration
    } else {
      const text =
        f.dialogType === 'emphasis'
          ? f.lines.join('')
          : f.fullText
      const units = estimateReadUnits(text)
      // 保底时长与阅读时长相加：每帧都有固定保底停顿 + 按内容计算的阅读时间
      dwell = minDwell + units * autoPlayInterval
    }
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null
      const idx = currentIndexRef.current
      if (idx >= totalFrames - 1) {
        // 自动播放抵达最后一帧：停留 → 改为自动返回上一级
        onExitRef.current?.()
        return
      }
      goNextRef.current(idx + 1)
    }, preDelay + dwell)
  }, [totalFrames, autoPlayInterval, minDwell, onExitRef])

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

  const startTypingAnim = useCallback((f: RenderFrame, skip = false, delay = 0) => {
    const n = f.fullText.length
    visibleCount.value = 0
    setVisibleChars(0)
    setAnimDone(false)

    if (skip || n === 0) {
      visibleCount.value = n
      setVisibleChars(n)
      setAnimDone(true)
      if (autoPlayRef.current) startAutoTimer(f, delay)
      return
    }

    // delay > 0 时（如 transition 黑幕淡入尚未完成）先等待再开始打字，
    // 确保画面完全切入当前场景后才播放文字动画
    visibleCount.value = withDelay(
      delay,
      withTiming(
        n,
        { duration: n * 50, easing: Easing.linear },
        (finished) => { if (finished) runOnJS(onTypingDone)() },
      ),
    )
  }, [onTypingDone, startAutoTimer, visibleCount])

  useEffect(() => {
    // 若本帧是通过 transition 黑幕淡入进入的（fadeInDelay>0），等新画面完全显示后
    // 再开始播放文字动画；非切页帧 fadeInDelay=0，立即播放。

    // 只在有对话框的帧淡入；emphasis 帧无需操作 dlgOpacity
    if (frame.dialogType !== 'emphasis') {
      dlgOpacity.value = withTiming(1, { duration: 180, easing: Easing.ease })
    }
    if (frame.dialogType === 'dialogue' || frame.dialogType === 'narration') {
      startTypingAnim(frame, false, fadeInDelay)
    } else if (frame.dialogType === 'cutscene') {
      visibleCount.value = 0
      setVisibleChars(0)
      setAnimDone(true)
      setEmphSkip(false)
      // 空镜：等待淡入完成后再开始计停留时长
      if (autoPlayRef.current) startAutoTimer(frame, fadeInDelay)
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
        enteredViaFadeRef.current = true   // 标记：本帧经由黑幕淡入进入
        runOnJS(applyFrameSwitch)(nextIdx)
        fadeOverlay.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.linear })
      })
    } else {
      enteredViaFadeRef.current = false
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

        {/* 场景容器：背景 / 立绘 / 对话框 / 控制键 全部锚定在场景内，
            9:16 / 3:4 时上下留黑边，对话框贴场景底、控制键落在区域内 */}
        <View style={sceneStyle}>
          {/* ① 背景 */}
          <SceneBackground bgUri={frame.bgUri} bgColor={frame.bgColor} />

          {/* ② 立绘 */}
          <SpriteLayer spriteUri={frame.spriteUri} spriteOverride={frame.spriteOverride} sceneHeight={sceneH} />

          {/* ③ 底部渐出 */}
          <BottomFade sceneHeight={sceneH} />

          {/* ④ 自动播放键（场景右上，区域内） */}
          <AutoPlayButton active={autoPlay} onToggle={handleAutoToggle} />

          {/* ⑥ 返回键（仅 onExit 模式，场景左上，区域内） */}
          {onExit && <BackButton onPress={onExit} />}

          {/* ⑦ 切页黑幕（transition 动画用） */}
          <Animated.View
            style={[StyleSheet.absoluteFill, fadeOverlayStyle]}
            pointerEvents="none"
          />

          {/* ⑧ 对话框层 — 统一组件，贴场景底边；bottom 偏移按画幅等比缩放（9:16 基准） */}
          <Animated.View style={[styles.dlgLayer, dlgFadeStyle, { bottom: Math.round(FROST.dlgBottom * boxScale) }]} pointerEvents="none">
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

          {/* ⑨ 大字模式（锚定场景内居中） */}
          {frame.dialogType === 'emphasis' && frame.lines.length > 0 && (
            <EmphasisText
              lines={frame.lines}
              color={frame.emphasisColor}
              align={frame.emphasisAlign}
              fontSize={frame.emphasisFontSize}
              lineHeight={frame.emphasisLineHeight}
              animKey={frame.id}
              startDelay={fadeInDelay}
              skipAnim={emphSkip}
              onAnimDone={handleEmphAnimDone}
            />
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
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
