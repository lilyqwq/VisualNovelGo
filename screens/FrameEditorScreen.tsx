import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  StyleSheet, StatusBar, TextInput, Modal, Dimensions, Image, BackHandler,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated'
import {
  EditorFrame as Frame, loadChapterFrames, saveChapterFrames,
  BUILTIN_BLACK_ID, BUILTIN_WHITE_ID,
  type AspectRatio,
} from '../hooks/useFrameResolver'
import PlayerScreen from './PlayerScreen'

// ── Types ─────────────────────────────────────────────────────────────────────
type DialogType = 'dialogue' | 'narration' | 'emphasis' | 'cutscene'

interface BgRecord    { id: string; uri: string; name: string }
interface CharRecord  { id: string; name: string; defaultSpriteId: string | null }
interface SpriteRecord {
  id: string; uri: string; name: string
  defaultScale?: number; defaultOffsetX?: number; defaultOffsetY?: number
}

export interface Props {
  chapterId: string
  chapterName: string
  onBack: () => void
  aspect?: AspectRatio
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_H   = StatusBar.currentHeight ?? 24
const TOPBAR_H   = 72
const STRIP_H    = 96
const TABBAR_H   = 42
const HARD_BOT_H      = 30
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('screen')
const BOTTOM_PANEL_H  = Math.round(SCREEN_H * 0.62)   // 同步面板 & 排序弹窗共用高度

const THUMB_W      = 48
const THUMB_H_IMG  = 62
const THUMB_ITEM_W = 60
const STRIP_PAD    = 12

const MINI_H         = 180
const MINI_W         = Math.max(78, Math.round(MINI_H * SCREEN_W / Math.max(1, SCREEN_H)))
const MINI_DLG_BOT   = Math.round(72  * MINI_H / Math.max(1, SCREEN_H))
const MINI_SPRITE_BOT = 0

const SORT_ROW_H = 52

const ASSET_W        = 54
const ASSET_H        = 70
const SPRITE_CELL_H  = 80

type Tab = 'content' | 'background' | 'sprite' | 'style'
const TAB_LABELS: Record<Tab, string> = {
  content: '内容', background: '背景', sprite: '立绘', style: '样式',
}
const TYPE_SHORT: Record<DialogType, string> = {
  dialogue: '对白', narration: '旁白', emphasis: '大字', cutscene: '空镜',
}

const KEY_CHAR     = 'library_characters_v1'
const KEY_SP       = 'library_sprites_v1'
const KEY_BG       = 'library_backgrounds_v1'
export const KEY_SETTINGS = 'global_settings_v1'

const BG_DIR     = (FileSystem.documentDirectory ?? '') + 'library/backgrounds/'
const SPRITE_DIR = (FileSystem.documentDirectory ?? '') + 'library/sprites/'

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

function makeSingleFrame(): Frame {
  return {
    id: genId(), dialogType: 'narration', characterId: null,
    text: '', backgroundId: null, spriteId: null, spriteOverride: null, transition: false,
  }
}

// 取某立绘已保存的默认值（未保存过则返回 null）
function spriteSavedOverride(
  sprites: SpriteRecord[],
  spriteId: string | null,
): { scale: number; offsetX: number; offsetY: number } | null {
  if (!spriteId) return null
  const rec = sprites.find(s => s.id === spriteId)
  if (!rec || rec.defaultScale === undefined) return null
  return { scale: rec.defaultScale, offsetX: rec.defaultOffsetX ?? 0, offsetY: rec.defaultOffsetY ?? 0 }
}

async function loadList<T>(key: string): Promise<T[]> {
  try { const r = await AsyncStorage.getItem(key); return r ? JSON.parse(r) : [] }
  catch { return [] }
}

async function reqPerm(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  return status === 'granted'
}

async function pickAndSave(
  destDir: string,
  opts: Partial<ImagePicker.ImagePickerOptions>,
): Promise<string | null> {
  if (!(await reqPerm())) return null
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images' as any, quality: 1, ...opts,
  })
  if (res.canceled || !res.assets[0]) return null
  await FileSystem.makeDirectoryAsync(destDir, { intermediates: true })
  const destUri = destDir + Date.now() + '.jpg'
  await FileSystem.copyAsync({ from: res.assets[0].uri, to: destUri })
  return destUri
}

// ── FrameThumbVisual ──────────────────────────────────────────────────────────
function FrameThumbVisual({ frame, index, isActive }: { frame: Frame; index: number; isActive: boolean }) {
  return (
    <View style={[S.thumbWrap, isActive && S.thumbWrapActive]}>
      <View style={[S.thumbImg, isActive && S.thumbImgActive]}>
        {frame.dialogType === 'dialogue' && (
          <>
            <View style={S.thumbCharSil} />
            <View style={S.thumbDlgBar} />
          </>
        )}
        {frame.dialogType === 'narration' && <View style={S.thumbNarrBar} />}
        {frame.dialogType === 'emphasis' && (
          <View style={S.thumbEmphasisWrap}>
            <Text style={S.thumbEmphasisText}>{frame.text?.[0] ?? '大'}</Text>
          </View>
        )}
        {frame.dialogType === 'cutscene' && (
          <>
            <View style={S.thumbLetterboxTop} />
            <View style={S.thumbLetterboxBot} />
          </>
        )}
        {isActive && <View style={S.thumbActiveDot} />}
      </View>
      <Text style={[S.thumbNum, isActive && S.thumbNumActive]}>
        {String(index + 1).padStart(2, '0')}
      </Text>
    </View>
  )
}

// ── FrameThumbItem ────────────────────────────────────────────────────────────
function FrameThumbItem({ frame, index, isActive, onPress }: {
  frame: Frame; index: number; isActive: boolean; onPress: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
      <FrameThumbVisual frame={frame} index={index} isActive={isActive} />
    </TouchableOpacity>
  )
}

// ── SortRowVisual ─────────────────────────────────────────────────────────────
function SortRowVisual({ frame, index }: { frame: Frame; index: number }) {
  return (
    <View style={S.sortRow}>
      <Text style={S.sortRowNum}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={[S.sortRowBadge,
        frame.dialogType === 'emphasis'  && S.sortRowBadgeEmph,
        frame.dialogType === 'narration' && S.sortRowBadgeNarr,
      ]}>
        <Text style={S.sortRowBadgeText}>{TYPE_SHORT[frame.dialogType]}</Text>
      </View>
      <Text style={S.sortRowText} numberOfLines={1}>{frame.text || '（空）'}</Text>
      <View style={S.sortHandle}>
        <View style={S.sortHandleLine} />
        <View style={S.sortHandleLine} />
        <View style={S.sortHandleLine} />
      </View>
    </View>
  )
}

// ── SortRow ───────────────────────────────────────────────────────────────────
interface SortRowProps {
  frame: Frame; index: number; isDragging: boolean
  onDragStart: (absY: number) => void
  onDragUpdate: (absY: number) => void
  onDragEnd: () => void
}
function SortRow({ frame, index, isDragging, onDragStart, onDragUpdate, onDragEnd }: SortRowProps) {
  const cbRef = useRef({ onDragStart, onDragUpdate, onDragEnd })
  cbRef.current = { onDragStart, onDragUpdate, onDragEnd }
  const handleGesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(e  => runOnJS(cbRef.current.onDragStart)(e.absoluteY))
    .onUpdate(e => runOnJS(cbRef.current.onDragUpdate)(e.absoluteY))
    .onFinalize(()=> runOnJS(cbRef.current.onDragEnd)()),
  [])
  return (
    <Animated.View style={[S.sortRow, isDragging && { opacity: 0.22 }]}>
      <Text style={S.sortRowNum}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={[S.sortRowBadge,
        frame.dialogType === 'emphasis'  && S.sortRowBadgeEmph,
        frame.dialogType === 'narration' && S.sortRowBadgeNarr,
      ]}>
        <Text style={S.sortRowBadgeText}>{TYPE_SHORT[frame.dialogType]}</Text>
      </View>
      <Text style={S.sortRowText} numberOfLines={1}>{frame.text || '（空）'}</Text>
      <GestureDetector gesture={handleGesture}>
        <View style={S.sortHandle}>
          <View style={S.sortHandleLine} />
          <View style={S.sortHandleLine} />
          <View style={S.sortHandleLine} />
        </View>
      </GestureDetector>
    </Animated.View>
  )
}

// ── SortModal ─────────────────────────────────────────────────────────────────
function SortModal({ visible, frames, onReorder, onClose }: {
  visible: boolean; frames: Frame[]
  onReorder: (from: number, to: number) => void; onClose: () => void
}) {
  const [dragIdx, setDragIdx]     = useState(-1)
  const [insertIdx, setInsertIdx] = useState(-1)
  const dragSrcRef   = useRef(-1)
  const insertIdxRef = useRef(-1)
  const listPageY    = useRef(0)
  const scrollOffY   = useRef(0)
  const framesLenRef = useRef(frames.length)
  framesLenRef.current = frames.length
  const listViewRef = useRef<View>(null)
  const ghostY = useSharedValue(-9999)

  const handleDragStart = useCallback((idx: number, absY: number) => {
    dragSrcRef.current = idx; insertIdxRef.current = idx
    setDragIdx(idx); setInsertIdx(idx)
    ghostY.value = absY - listPageY.current - SORT_ROW_H / 2
  }, [ghostY])

  const handleDragUpdate = useCallback((absY: number) => {
    ghostY.value = absY - listPageY.current - SORT_ROW_H / 2
    const relY = absY - listPageY.current + scrollOffY.current
    const ins = Math.max(0, Math.min(framesLenRef.current, Math.round(relY / SORT_ROW_H)))
    insertIdxRef.current = ins; setInsertIdx(ins)
  }, [ghostY])

  const handleDragEnd = useCallback(() => {
    const src = dragSrcRef.current; const ins = insertIdxRef.current
    dragSrcRef.current = -1; insertIdxRef.current = -1
    ghostY.value = -9999; setDragIdx(-1); setInsertIdx(-1)
    if (src >= 0 && ins >= 0 && src !== ins && src + 1 !== ins) onReorder(src, ins)
  }, [ghostY, onReorder])

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ghostY.value }],
    opacity: ghostY.value < -100 ? 0 : 0.92,
  }))

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={S.overlay} onPress={onClose}>
          <Pressable style={S.sortBox} onPress={() => {}}>
            <View style={S.sortHeader}>
              <LinearGradient
                colors={['transparent', 'rgba(210,235,248,0.14)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1, marginBottom: 16 }}
              />
              <View style={S.sortHeaderRow}>
                <Text style={S.sortTitle}>帧顺序</Text>
                <TouchableOpacity style={S.sortCloseBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={S.sortCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={S.sortHint}>长按右侧 ≡ 拖拽排序</Text>
            </View>
            <View
              ref={listViewRef}
              style={{ flex: 1, position: 'relative' }}
              onLayout={() => {
                listViewRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
                  listPageY.current = pageY
                })
              }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                onScroll={e => { scrollOffY.current = e.nativeEvent.contentOffset.y }}
                scrollEventThrottle={16}
              >
                {frames.map((frame, idx) => (
                  <View key={frame.id}>
                    {insertIdx === idx && dragIdx >= 0 && dragIdx !== idx && dragIdx !== idx - 1 && (
                      <View style={S.sortInsertLine} />
                    )}
                    <SortRow
                      frame={frame} index={idx} isDragging={idx === dragIdx}
                      onDragStart={absY => handleDragStart(idx, absY)}
                      onDragUpdate={handleDragUpdate}
                      onDragEnd={handleDragEnd}
                    />
                  </View>
                ))}
                {insertIdx === frames.length && dragIdx >= 0 && <View style={S.sortInsertLine} />}
                <View style={{ height: 20 }} />
              </ScrollView>
              {dragIdx >= 0 && frames[dragIdx] && (
                <Animated.View style={[S.sortGhost, ghostStyle]} pointerEvents="none">
                  <SortRowVisual frame={frames[dragIdx]} index={dragIdx} />
                </Animated.View>
              )}
            </View>
            <View style={S.sortHardBot} />
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ── SectionHead ───────────────────────────────────────────────────────────────
function SectionHead({ title }: { title: string }) {
  return (
    <View style={S.sectionHead}>
      <View style={S.sectionGem} />
      <Text style={S.sectionTitle}>{title}</Text>
      <View style={S.sectionLine} />
    </View>
  )
}

// ── StepperRow ────────────────────────────────────────────────────────────────
function StepperRow({ label, hint, value, decimals = 0, onDecrement, onIncrement }: {
  label: string; hint?: string; value: number; decimals?: number
  onDecrement: () => void; onIncrement: () => void
}) {
  return (
    <View style={S.stepperRow}>
      <View style={{ flex: 1 }}>
        <Text style={S.stepperLabel}>{label}</Text>
        {hint ? <Text style={S.stepperHint}>{hint}</Text> : null}
      </View>
      <View style={S.stepperWrap}>
        <TouchableOpacity style={S.stepBtn} onPress={onDecrement} activeOpacity={0.7}>
          <Text style={S.stepBtnText}>−</Text>
        </TouchableOpacity>
        <View style={S.stepNum}>
          <Text style={S.stepNumText}>{value.toFixed(decimals)}</Text>
        </View>
        <TouchableOpacity style={S.stepBtn} onPress={onIncrement} activeOpacity={0.7}>
          <Text style={S.stepBtnText}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── MiniPreview ───────────────────────────────────────────────────────────────
function resolveFrameBgId(frames: Frame[], idx: number): string | null {
  for (let i = idx; i >= 0; i--) {
    if (frames[i].backgroundId !== null) return frames[i].backgroundId
  }
  return null
}

function getMiniBackground(bgId: string | null, bgMap: Record<string, BgRecord>) {
  if (bgId === BUILTIN_BLACK_ID) return { color: '#000000' }
  if (bgId === BUILTIN_WHITE_ID) return { color: '#ffffff' }
  if (bgId) {
    const bg = bgMap[bgId]
    if (bg) return { uri: bg.uri }
  }
  return null
}

function MiniPreview({ frames, currentIdx, bgMap, charMap, spriteMap }: {
  frames: Frame[]
  currentIdx: number
  bgMap: Record<string, BgRecord>
  charMap: Record<string, CharRecord>
  spriteMap: Record<string, SpriteRecord>
}) {
  const frame  = frames[currentIdx]
  const char   = frame.characterId ? charMap[frame.characterId] : null
  const sprite = frame.spriteId ? spriteMap[frame.spriteId] : null
  const resolvedBgId = resolveFrameBgId(frames, currentIdx)
  const bgInfo = getMiniBackground(resolvedBgId, bgMap)
  const sprOv  = frame.spriteOverride

  const miniSpriteStyle: object[] = [S.miniSprite]
  if (sprOv) {
    miniSpriteStyle.push({
      transform: [
        { scale: sprOv.scale },
        { translateX: sprOv.offsetX * MINI_W / SCREEN_W },
        { translateY: -(sprOv.offsetY) * MINI_H / SCREEN_H },
      ],
    })
  }

  return (
    <View style={S.miniPhone}>
      {bgInfo
        ? bgInfo.color
          ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bgInfo.color }]} />
          : <Image source={{ uri: bgInfo.uri! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        : <LinearGradient colors={['#050608', '#060a14', '#040508']} style={StyleSheet.absoluteFillObject} />
      }
      {sprite && (
        <Image source={{ uri: sprite.uri }} style={miniSpriteStyle} resizeMode="contain" />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(4,6,12,0.72)']}
        style={S.miniFade}
        pointerEvents="none"
      />
      {frame.dialogType === 'dialogue' && (
        <View style={S.miniDlgBox}>
          {char && (
            <View style={S.miniNamebar}>
              <View style={S.miniGem} />
              <Text style={S.miniName}>{char.name}</Text>
            </View>
          )}
          <Text style={S.miniDlgText} numberOfLines={3}>{frame.text}</Text>
        </View>
      )}
      {frame.dialogType === 'narration' && (
        <View style={S.miniNarrBox}>
          <Text style={S.miniNarrText} numberOfLines={3}>{frame.text}</Text>
        </View>
      )}
      {frame.dialogType === 'emphasis' && (
        <View style={[
          S.miniEmphasisBox,
          {
            alignItems: frame.emphasisAlign === 'left'  ? 'flex-start'
                      : frame.emphasisAlign === 'right' ? 'flex-end'
                      : 'center',
            paddingHorizontal: Math.round(MINI_W * 0.06),
          },
        ]}>
          <Text style={[
            S.miniEmphasisText,
            {
              color: frame.emphasisColor === 'red'   ? '#ff4444'
                   : frame.emphasisColor === 'black' ? '#1a1a1a'
                   : 'rgba(230,242,250,0.92)',
              textAlign: (frame.emphasisAlign ?? 'center') as 'center' | 'left' | 'right',
            },
          ]}>{frame.text}</Text>
        </View>
      )}
    </View>
  )
}

// ── ContentTab ────────────────────────────────────────────────────────────────
function ContentTab({ frame, chars, sprites, onUpdate, canDelete, onDelete, onAddChar }: {
  frame: Frame
  chars: CharRecord[]
  sprites: SpriteRecord[]
  onUpdate: (patch: Partial<Frame>) => void
  canDelete: boolean
  onDelete: () => void
  onAddChar: () => void
}) {
  const TYPES: { type: DialogType; icon: string; label: string }[] = [
    { type: 'dialogue',  icon: '「」', label: '对白' },
    { type: 'narration', icon: '≡',   label: '旁白' },
    { type: 'emphasis',  icon: '✦',   label: '大字' },
  ]
  const isCutscene = frame.dialogType === 'cutscene'
  return (
    <>
      <View style={S.section}>
        <SectionHead title="对话框类型" />
        <View style={S.typeCol}>
          <View style={S.typeRow}>
            {TYPES.map(({ type, icon, label }) => (
              <TouchableOpacity
                key={type}
                style={[S.typeOpt, frame.dialogType === type && S.typeOptSel]}
                onPress={() => onUpdate({ dialogType: type })}
                activeOpacity={0.7}
              >
                <Text style={[S.typeIcon, frame.dialogType === type && S.typeIconSel]}>{icon}</Text>
                <Text style={[S.typeLabel, frame.dialogType === type && S.typeLabelSel]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[S.typeBanner, isCutscene && S.typeOptSel]}
            onPress={() => onUpdate({ dialogType: 'cutscene' })}
            activeOpacity={0.7}
          >
            <Text style={[S.typeIcon, { marginBottom: 0 }, isCutscene && S.typeIconSel]}>◎</Text>
            <Text style={[S.typeLabel, isCutscene && S.typeLabelSel]}>空镜</Text>
          </TouchableOpacity>
        </View>
      </View>

      {frame.dialogType === 'dialogue' && (
        <View style={S.section}>
          <SectionHead title="说话角色" />
          <View style={S.chipRow}>
            {chars.map(char => (
              <TouchableOpacity
                key={char.id}
                style={[S.chip, frame.characterId === char.id && S.chipSel]}
                onPress={() => {
                  const sid = char.defaultSpriteId
                  onUpdate({
                    characterId: char.id,
                    spriteId: sid,
                    spriteOverride: sid ? spriteSavedOverride(sprites, sid) : null,
                  })
                }}
                activeOpacity={0.7}
              >
                <View style={S.chipAvatar}>
                  <Text style={S.chipAvatarText}>{char.name[0]}</Text>
                </View>
                <Text style={[S.chipText, frame.characterId === char.id && S.chipTextSel]}>
                  {char.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={S.chipAdd} onPress={onAddChar} activeOpacity={0.7}>
              <Text style={S.chipAddText}>＋ 新建角色</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isCutscene && (
        <View style={S.section}>
          <SectionHead title="对话内容" />
          <View style={S.textWrap}>
            <TextInput
              style={S.textInput}
              value={frame.text}
              onChangeText={t => onUpdate({ text: t })}
              placeholder="输入对话内容……"
              placeholderTextColor="rgba(135,175,205,0.36)"
              selectionColor="rgba(210,235,248,0.5)"
              multiline
              textAlignVertical="top"
            />
            <Text style={S.charCount}>{frame.text.length} 字</Text>
          </View>
        </View>
      )}

      <View style={S.section}>
        <SectionHead title="帧间转场" />
        <View style={S.toggleRow}>
          <View>
            <Text style={S.toggleLabel}>淡入淡出</Text>
            <Text style={S.toggleSub}>切入本帧时播放</Text>
          </View>
          <TouchableOpacity
            style={[S.toggle, frame.transition && S.toggleOn]}
            onPress={() => onUpdate({ transition: !frame.transition })}
            activeOpacity={0.8}
          >
            <View style={[S.toggleKnob, frame.transition && S.toggleKnobOn]} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[S.section, { paddingBottom: 8 }]}>
        <TouchableOpacity
          style={[S.deleteFrameBtn, !canDelete && S.deleteFrameBtnDisabled]}
          onPress={onDelete}
          activeOpacity={canDelete ? 0.7 : 1}
        >
          <Text style={[S.deleteFrameBtnText, !canDelete && S.deleteFrameBtnTextDisabled]}>
            删除此帧
          </Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

// ── BackgroundTab ─────────────────────────────────────────────────────────────
function BackgroundTab({ frame, frames, currentIdx, bgs, onUpdate, onImport, onSync }: {
  frame: Frame; frames: Frame[]; currentIdx: number
  bgs: BgRecord[]
  onUpdate: (patch: Partial<Frame>) => void
  onImport: () => void
  onSync: () => void
}) {
  const prevFrame = currentIdx > 0 ? frames[currentIdx - 1] : null
  const canInherit = currentIdx > 0

  return (
    <>
      <View style={S.section}>
        <SectionHead title="选择背景" />
        <View style={S.assetGrid}>
          {/* Built-in black */}
          <TouchableOpacity
            style={[S.assetCell, frame.backgroundId === BUILTIN_BLACK_ID && S.assetCellSel]}
            onPress={() => onUpdate({ backgroundId: BUILTIN_BLACK_ID })}
            activeOpacity={0.7}
          >
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={S.assetBuiltinLabel}>纯黑</Text>
            </View>
            {frame.backgroundId === BUILTIN_BLACK_ID && (
              <View style={S.assetCheck}><Text style={S.assetCheckText}>✓</Text></View>
            )}
          </TouchableOpacity>

          {/* Built-in white */}
          <TouchableOpacity
            style={[S.assetCell, frame.backgroundId === BUILTIN_WHITE_ID && S.assetCellSel]}
            onPress={() => onUpdate({ backgroundId: BUILTIN_WHITE_ID })}
            activeOpacity={0.7}
          >
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={S.assetBuiltinLabelDark}>纯白</Text>
            </View>
            {frame.backgroundId === BUILTIN_WHITE_ID && (
              <View style={S.assetCheck}><Text style={S.assetCheckText}>✓</Text></View>
            )}
          </TouchableOpacity>

          {/* Library bgs */}
          {bgs.map(bg => {
            const isSel = frame.backgroundId === bg.id
            return (
              <TouchableOpacity
                key={bg.id}
                style={[S.assetCell, isSel && S.assetCellSel]}
                onPress={() => onUpdate({ backgroundId: bg.id })}
                activeOpacity={0.7}
              >
                <Image source={{ uri: bg.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                {isSel && <View style={S.assetCheck}><Text style={S.assetCheckText}>✓</Text></View>}
              </TouchableOpacity>
            )
          })}

          {/* Import cell */}
          <TouchableOpacity style={S.assetAddCell} onPress={onImport} activeOpacity={0.7}>
            <Text style={S.assetAddIcon}>＋</Text>
            <Text style={S.assetAddText}>导入图片</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={S.section}>
        <SectionHead title="快捷操作" />
        <TouchableOpacity
          style={[S.actionBtn, !canInherit && S.actionBtnDim]}
          onPress={() => canInherit && onUpdate({ backgroundId: null })}
          activeOpacity={canInherit ? 0.7 : 1}
        >
          <Text style={S.actionBtnText}>↑ 沿用上一帧背景</Text>
        </TouchableOpacity>
        <View style={{ height: 8 }} />
        <TouchableOpacity style={S.syncBtn} onPress={onSync} activeOpacity={0.7}>
          <Text style={S.syncBtnText}>同步到后续帧 ›</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

// ── SpriteTab ─────────────────────────────────────────────────────────────────
function SpriteTab({ frame, frames, currentIdx, sprites, onUpdate, onImport, onSync, onSaveDefault }: {
  frame: Frame; frames: Frame[]; currentIdx: number
  sprites: SpriteRecord[]
  onUpdate: (patch: Partial<Frame>) => void
  onImport: () => void
  onSync: () => void
  onSaveDefault: () => void
}) {
  const prevFrame  = currentIdx > 0 ? frames[currentIdx - 1] : null
  const canInherit = currentIdx > 0
  const sprOv      = frame.spriteOverride ?? { scale: 1.0, offsetX: 0, offsetY: 0 }
  const curSprite  = sprites.find(s => s.id === frame.spriteId) ?? null
  const dScale     = curSprite?.defaultScale ?? 1.0
  const dOffX      = curSprite?.defaultOffsetX ?? 0
  const dOffY      = curSprite?.defaultOffsetY ?? 0

  return (
    <>
      <View style={S.section}>
        <SectionHead title="立绘资源" />
        <View style={S.assetGrid}>
          {/* No sprite cell – first option */}
          <TouchableOpacity
            style={[S.spriteCell, frame.spriteId === null && S.assetCellSel]}
            onPress={() => onUpdate({ spriteId: null, spriteOverride: null })}
            activeOpacity={0.7}
          >
            <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={S.spriteNoneIcon}>○</Text>
              <Text style={S.spriteNoneLabel}>无立绘</Text>
            </View>
            {frame.spriteId === null && <View style={S.assetCheck}><Text style={S.assetCheckText}>✓</Text></View>}
          </TouchableOpacity>

          {sprites.map(sp => {
            const isSel = frame.spriteId === sp.id
            return (
              <TouchableOpacity
                key={sp.id}
                style={[S.spriteCell, isSel && S.assetCellSel]}
                onPress={() => {
                  const savedOv = spriteSavedOverride(sprites, sp.id)
                  onUpdate({ spriteId: sp.id, spriteOverride: savedOv })
                }}
                activeOpacity={0.7}
              >
                <Image source={{ uri: sp.uri }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
                {isSel && <View style={S.assetCheck}><Text style={S.assetCheckText}>✓</Text></View>}
              </TouchableOpacity>
            )
          })}
          <TouchableOpacity style={S.spriteAddCell} onPress={onImport} activeOpacity={0.7}>
            <Text style={S.assetAddIcon}>＋</Text>
            <Text style={S.assetAddText}>导入图片</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={S.section}>
        <SectionHead title="快捷操作" />
        <TouchableOpacity
          style={[S.actionBtn, !canInherit && S.actionBtnDim]}
          onPress={() => {
            if (!canInherit || !prevFrame) return
            onUpdate({ spriteId: prevFrame.spriteId, spriteOverride: prevFrame.spriteOverride })
          }}
          activeOpacity={canInherit ? 0.7 : 1}
        >
          <Text style={S.actionBtnText}>↑ 沿用上一帧立绘</Text>
        </TouchableOpacity>
      </View>

      {frame.spriteId !== null && (
        <View style={S.section}>
          <SectionHead title="位置与缩放" />
          <StepperRow
            label="缩放" hint={`默认 ${dScale.toFixed(2)} · 步进 0.05`}
            value={sprOv.scale} decimals={2}
            onDecrement={() => onUpdate({ spriteOverride: { ...sprOv, scale: +(sprOv.scale - 0.05).toFixed(2) } })}
            onIncrement={() => onUpdate({ spriteOverride: { ...sprOv, scale: +(sprOv.scale + 0.05).toFixed(2) } })}
          />
          <StepperRow
            label="水平位移" hint={`默认 ${dOffX} · 步进 10px`}
            value={sprOv.offsetX}
            onDecrement={() => onUpdate({ spriteOverride: { ...sprOv, offsetX: sprOv.offsetX - 10 } })}
            onIncrement={() => onUpdate({ spriteOverride: { ...sprOv, offsetX: sprOv.offsetX + 10 } })}
          />
          <StepperRow
            label="垂直位移" hint={`默认 ${dOffY} · 步进 10px`}
            value={sprOv.offsetY}
            onDecrement={() => onUpdate({ spriteOverride: { ...sprOv, offsetY: sprOv.offsetY - 10 } })}
            onIncrement={() => onUpdate({ spriteOverride: { ...sprOv, offsetY: sprOv.offsetY + 10 } })}
          />
          <View style={{ height: 10 }} />
          <View style={S.doubleBtn}>
            <TouchableOpacity
              style={S.doubleBtnItem}
              onPress={() => onUpdate({ spriteOverride: spriteSavedOverride(sprites, frame.spriteId) })}
              activeOpacity={0.7}
            >
              <Text style={S.doubleBtnText}>恢复默认</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.doubleBtnItem, S.doubleBtnRight]}
              onPress={onSaveDefault}
              activeOpacity={0.7}
            >
              <Text style={S.doubleBtnText}>保存为默认值</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 8 }} />
          <TouchableOpacity style={S.syncBtn} onPress={onSync} activeOpacity={0.7}>
            <Text style={S.syncBtnText}>同步到后续帧 ›</Text>
          </TouchableOpacity>
        </View>
      )}

      {frame.spriteId === null && (
        <View style={S.section}>
          <TouchableOpacity style={S.syncBtn} onPress={onSync} activeOpacity={0.7}>
            <Text style={S.syncBtnText}>同步到后续帧 ›</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  )
}

// ── StyleTab ──────────────────────────────────────────────────────────────────
function StyleTab({ frame, globalAutoPlay, globalMinDwell, onUpdate, onAutoPlayChange, onMinDwellChange }: {
  frame: Frame
  globalAutoPlay: number
  globalMinDwell: number
  onUpdate: (patch: Partial<Frame>) => void
  onAutoPlayChange: (val: number) => void
  onMinDwellChange: (val: number) => void
}) {
  const isEmphasis  = frame.dialogType === 'emphasis'
  const isCutscene  = frame.dialogType === 'cutscene'
  const cutsceneDur = frame.cutsceneDuration ?? 3000
  const dlgSize  = frame.dialogFontSize    ?? 15
  const emphSize = frame.emphasisFontSize  ?? 34
  const emphLH   = frame.emphasisLineHeight ?? 1.7
  const emphColor = frame.emphasisColor   ?? 'white'
  const emphAlign = frame.emphasisAlign   ?? 'center'

  const COLOR_OPTS: { key: 'white' | 'black' | 'red'; bg: string; label: string }[] = [
    { key: 'white', bg: '#ffffff', label: '白' },
    { key: 'black', bg: '#111318', label: '黑' },
    { key: 'red',   bg: '#c42020', label: '红' },
  ]
  const ALIGN_OPTS: { key: 'center' | 'left' | 'right'; label: string }[] = [
    { key: 'center', label: '居中' },
    { key: 'left',   label: '左对齐' },
    { key: 'right',  label: '右对齐' },
  ]

  if (isCutscene) {
    return (
      <View style={S.section}>
        <SectionHead title="空镜停留时长" />
        <StepperRow
          label="停留时长" hint="单位 ms · 默认 3000 · 步进 250"
          value={cutsceneDur}
          onDecrement={() => onUpdate({ cutsceneDuration: Math.max(500, cutsceneDur - 250) })}
          onIncrement={() => onUpdate({ cutsceneDuration: Math.min(30000, cutsceneDur + 250) })}
        />
      </View>
    )
  }

  return (
    <>
      {!isEmphasis && (
        <View style={S.section}>
          <SectionHead title="对话框字号" />
          <StepperRow
            label="字号" hint="默认 15"
            value={dlgSize}
            onDecrement={() => onUpdate({ dialogFontSize: Math.max(8, dlgSize - 1) })}
            onIncrement={() => onUpdate({ dialogFontSize: Math.min(28, dlgSize + 1) })}
          />
        </View>
      )}

      {isEmphasis && (
        <>
          <View style={S.section}>
            <SectionHead title="大字字号" />
            <StepperRow
              label="字号" hint="默认 34"
              value={emphSize}
              onDecrement={() => onUpdate({ emphasisFontSize: Math.max(12, emphSize - 1) })}
              onIncrement={() => onUpdate({ emphasisFontSize: Math.min(72, emphSize + 1) })}
            />
          </View>

          <View style={S.section}>
            <SectionHead title="大字行间距" />
            <StepperRow
              label="行间距" hint="默认 1.7" decimals={1}
              value={emphLH}
              onDecrement={() => onUpdate({ emphasisLineHeight: +(Math.max(1.0, emphLH - 0.1)).toFixed(1) })}
              onIncrement={() => onUpdate({ emphasisLineHeight: +(Math.min(3.0, emphLH + 0.1)).toFixed(1) })}
            />
          </View>

          <View style={S.section}>
            <SectionHead title="大字颜色" />
            <View style={S.colorRow}>
              {COLOR_OPTS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[S.colorOpt, { backgroundColor: opt.bg }, emphColor === opt.key && S.colorOptSel]}
                  onPress={() => onUpdate({ emphasisColor: opt.key })}
                  activeOpacity={0.7}
                />
              ))}
              <Text style={S.colorHint}>白 / 黑 / 红　默认白</Text>
            </View>
          </View>

          <View style={S.section}>
            <SectionHead title="大字对齐" />
            <View style={S.alignRow}>
              {ALIGN_OPTS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[S.alignOpt, emphAlign === opt.key && S.alignOptSel]}
                  onPress={() => onUpdate({ emphasisAlign: opt.key })}
                  activeOpacity={0.7}
                >
                  <Text style={[S.alignOptText, emphAlign === opt.key && S.alignOptTextSel]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}

      <View style={S.section}>
        <View style={S.sectionHead}>
          <View style={S.sectionGem} />
          <Text style={S.sectionTitle}>自动播放速度</Text>
          <View style={S.sectionLine} />
          <View style={S.globalBadge}>
            <Text style={S.globalBadgeText}>全局</Text>
          </View>
        </View>
        <StepperRow
          label="每字间隔 (ms)" hint="默认 300"
          value={globalAutoPlay}
          onDecrement={() => onAutoPlayChange(Math.max(50, globalAutoPlay - 50))}
          onIncrement={() => onAutoPlayChange(Math.min(2000, globalAutoPlay + 50))}
        />
        <StepperRow
          label="最低停留 (ms)" hint="默认 1500 · 每帧叠加保底"
          value={globalMinDwell}
          onDecrement={() => onMinDwellChange(Math.max(0, globalMinDwell - 50))}
          onIncrement={() => onMinDwellChange(Math.min(3000, globalMinDwell + 50))}
        />
      </View>
    </>
  )
}

// ── SyncFramePanel ────────────────────────────────────────────────────────────
function SyncFramePanel({ visible, title, frames, currentIdx, onConfirm, onClose }: {
  visible: boolean; title: string
  frames: Frame[]; currentIdx: number
  onConfirm: (indices: number[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const afterFrames = frames.slice(currentIdx + 1)
  const allSel = afterFrames.length > 0 && selected.size === afterFrames.length

  useEffect(() => { if (visible) setSelected(new Set()) }, [visible])

  const toggleAll = () => {
    if (allSel) {
      setSelected(new Set())
    } else {
      setSelected(new Set(afterFrames.map((_, i) => currentIdx + 1 + i)))
    }
  }

  const toggleOne = (absIdx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(absIdx)) next.delete(absIdx); else next.add(absIdx)
      return next
    })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={S.syncPanelOuter}>
        <View style={S.syncPanelHead}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 6 }}>
            <Text style={S.syncPanelCancel}>取消</Text>
          </TouchableOpacity>
          <Text style={S.syncPanelTitle}>{title}</Text>
          <View style={{ width: 44 }} />
        </View>

        <TouchableOpacity
          style={[S.syncSelectAll, allSel && S.syncSelectAllActive]}
          onPress={toggleAll}
          activeOpacity={0.7}
        >
          <Text style={S.syncSelectAllText}>{allSel ? '取消全选' : '全选后续帧'}</Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {afterFrames.length === 0 ? (
            <Text style={S.syncEmptyHint}>当前已是最后一帧</Text>
          ) : (
            afterFrames.map((frame, relIdx) => {
              const absIdx = currentIdx + 1 + relIdx
              const isSel  = selected.has(absIdx)
              return (
                <TouchableOpacity
                  key={frame.id}
                  style={S.syncFrameItem}
                  onPress={() => toggleOne(absIdx)}
                  activeOpacity={0.7}
                >
                  <View style={[S.syncCheck, isSel && S.syncCheckSel]}>
                    {isSel && <Text style={S.syncCheckMark}>✓</Text>}
                  </View>
                  <View style={S.syncFrameThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.syncFrameNum}>帧 {String(absIdx + 1).padStart(2, '0')}</Text>
                    <Text style={S.syncFrameType}>{TYPE_SHORT[frame.dialogType]}</Text>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={S.syncPanelFoot}>
          <Text style={S.syncCount}>已选 {selected.size} 帧</Text>
          <TouchableOpacity
            style={[S.syncConfirmBtn, selected.size === 0 && S.syncConfirmBtnDim]}
            onPress={() => { onConfirm(Array.from(selected)); onClose() }}
            activeOpacity={selected.size > 0 ? 0.7 : 1}
            disabled={selected.size === 0}
          >
            <Text style={S.syncConfirmBtnText}>确认同步</Text>
          </TouchableOpacity>
        </View>
        <View style={S.syncHardBot} />
      </View>
    </Modal>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FrameEditorScreen({ chapterId, chapterName, onBack, aspect = 'full' }: Props) {
  const [frames, setFrames]         = useState<Frame[]>(() => [makeSingleFrame()])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [activeTab, setActiveTab]   = useState<Tab>('content')
  const [bgs, setBgs]               = useState<BgRecord[]>([])
  const [chars, setChars]           = useState<CharRecord[]>([])
  const [sprites, setSprites]       = useState<SpriteRecord[]>([])
  const [globalAutoPlay, setGlobalAutoPlay] = useState(300)
  const [globalMinDwell, setGlobalMinDwell] = useState(1500)
  const [sortVisible, setSortVisible]   = useState(false)
  const [showPreview, setShowPreview]   = useState(false)
  const [syncPanel, setSyncPanel]       = useState<'background' | 'sprite' | null>(null)
  const [newCharModal, setNewCharModal] = useState(false)
  const [newCharName, setNewCharName]   = useState('')
  const [deleteModal, setDeleteModal]   = useState<{
    title: string; body: string
    onConfirm?: () => void
    confirmText?: string
    danger?: boolean
  } | null>(null)

  const loadedRef    = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const framesRef    = useRef(frames)
  framesRef.current  = frames
  const currentIdxRef = useRef(currentIdx)
  currentIdxRef.current = currentIdx
  const spritesRef   = useRef(sprites)
  spritesRef.current = sprites

  const currentFrame = frames[Math.min(currentIdx, frames.length - 1)]
  const bgMap     = Object.fromEntries(bgs.map(b => [b.id, b]))
  const charMap   = Object.fromEntries(chars.map(c => [c.id, c]))
  const spriteMap = Object.fromEntries(sprites.map(s => [s.id, s]))

  // Mount: load all library data + chapter frames + global settings
  useEffect(() => {
    loadList<BgRecord>(KEY_BG).then(setBgs)
    loadList<CharRecord>(KEY_CHAR).then(setChars)
    loadList<SpriteRecord>(KEY_SP).then(setSprites)
    AsyncStorage.getItem(KEY_SETTINGS).then(raw => {
      if (!raw) return
      try {
        const s = JSON.parse(raw)
        if (typeof s.autoPlayInterval === 'number') setGlobalAutoPlay(s.autoPlayInterval)
        if (typeof s.minDwell === 'number') setGlobalMinDwell(s.minDwell)
      } catch { /* ignore */ }
    })
    loadChapterFrames(chapterId).then(loaded => {
      setFrames(loaded)
      loadedRef.current = true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce-save frames whenever they change
  const scheduleSave = useCallback((f: Frame[]) => {
    if (!loadedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      saveChapterFrames(chapterId, f)
    }, 500)
  }, [chapterId])

  useEffect(() => { scheduleSave(frames) }, [frames, scheduleSave])

  const handleBack = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    if (loadedRef.current) await saveChapterFrames(chapterId, framesRef.current)
    onBack()
  }, [chapterId, onBack])

  const handleBackRef   = useRef(handleBack)
  handleBackRef.current = handleBack
  const showPreviewRef  = useRef(showPreview)
  showPreviewRef.current = showPreview

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 预览层（PlayerScreen overlay）自己处理
      if (showPreviewRef.current) return false
      handleBackRef.current()
      return true
    })
    return () => sub.remove()
  }, [])

  const updateFrame = useCallback((patch: Partial<Frame>) => {
    setFrames(prev => prev.map((f, i) => i === currentIdx ? { ...f, ...patch } : f))
  }, [currentIdx])

  // Insert new frame after current
  const makeBlankFrame = (): Frame => ({
    id: genId(), dialogType: 'dialogue', characterId: null,
    text: '', backgroundId: null, spriteId: null, spriteOverride: null, transition: false,
  })

  // 帧列表 "+" → 末尾追加
  const addFrameAtEnd = useCallback(() => {
    const fs = framesRef.current
    const resolvedBgId = resolveFrameBgId(fs, fs.length - 1)
    const f: Frame = { ...makeBlankFrame(), backgroundId: resolvedBgId }
    const newIdx = fs.length
    setFrames(prev => [...prev, f])
    setCurrentIdx(newIdx)
  }, [])

  // 预览区 "新建帧" → 当前帧后插入
  const addFrameAfterCurrent = useCallback(() => {
    const ci = currentIdxRef.current
    const fs = framesRef.current
    const resolvedBgId = resolveFrameBgId(fs, ci)
    const f: Frame = { ...makeBlankFrame(), backgroundId: resolvedBgId }
    setFrames(prev => {
      const next = [...prev]
      next.splice(ci + 1, 0, f)
      return next
    })
    setCurrentIdx(ci + 1)
  }, [])

  const handleReorder = useCallback((from: number, to: number) => {
    setFrames(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      const at = to > from ? to - 1 : to
      next.splice(at, 0, item)
      setCurrentIdx(ci => {
        if (ci === from)                            return at
        if (to > from  && ci > from  && ci <= at)  return ci - 1
        if (to <= from && ci >= to   && ci < from) return ci + 1
        return ci
      })
      return next
    })
  }, [])

  const requestDeleteFrame = useCallback(() => {
    if (frames.length <= 1) {
      setDeleteModal({ title: '无法删除', body: '章节至少需要保留一帧。' })
      return
    }
    const idx = currentIdx
    setDeleteModal({
      title: '删除此帧',
      body: `确认删除第 ${idx + 1} 帧？此操作不可撤销。`,
      onConfirm: () => {
        setFrames(prev => {
          const next = prev.filter((_, i) => i !== idx)
          setCurrentIdx(ci => (ci >= next.length ? next.length - 1 : ci))
          return next
        })
      },
    })
  }, [frames.length, currentIdx])

  // Sync handlers
  const handleSyncBackground = useCallback((indices: number[]) => {
    const fs = framesRef.current
    const ci = currentIdxRef.current
    let bgId: string | null = null
    for (let i = ci; i >= 0; i--) {
      if (fs[i]?.backgroundId != null) { bgId = fs[i].backgroundId; break }
    }
    setFrames(prev => prev.map((f, i) => indices.includes(i) ? { ...f, backgroundId: bgId } : f))
  }, [])

  const handleSyncSprite = useCallback((indices: number[]) => {
    const src = framesRef.current[currentIdxRef.current]
    setFrames(prev => prev.map((f, i) =>
      indices.includes(i)
        ? { ...f, spriteId: src?.spriteId ?? null, spriteOverride: src?.spriteOverride ?? null }
        : f
    ))
  }, [])

  // Image import handlers
  const handleImportBg = useCallback(async () => {
    const uri = await pickAndSave(BG_DIR, { allowsEditing: true, aspect: [SCREEN_W, SCREEN_H] as [number, number] })
    if (!uri) return
    const newBg: BgRecord = { id: genId(), uri, name: '背景 ' + (bgs.length + 1) }
    const updated = [...bgs, newBg]
    setBgs(updated)
    await AsyncStorage.setItem(KEY_BG, JSON.stringify(updated))
    updateFrame({ backgroundId: newBg.id })
  }, [bgs, updateFrame])

  const handleImportSprite = useCallback(async () => {
    const uri = await pickAndSave(SPRITE_DIR, { allowsEditing: true })
    if (!uri) return
    const newSp: SpriteRecord = { id: genId(), uri, name: '立绘 ' + (sprites.length + 1) }
    const updated = [...sprites, newSp]
    setSprites(updated)
    await AsyncStorage.setItem(KEY_SP, JSON.stringify(updated))
    updateFrame({ spriteId: newSp.id, spriteOverride: null })
  }, [sprites, updateFrame])

  // Save sprite override as default
  const handleSaveAsDefault = useCallback(async () => {
    const frame = framesRef.current[currentIdxRef.current]
    if (!frame?.spriteId) return
    const ov = frame.spriteOverride
    const updated = spritesRef.current.map(s =>
      s.id === frame.spriteId
        ? { ...s, defaultScale: ov?.scale ?? 1.0, defaultOffsetX: ov?.offsetX ?? 0, defaultOffsetY: ov?.offsetY ?? 0 }
        : s
    )
    setSprites(updated)
    await AsyncStorage.setItem(KEY_SP, JSON.stringify(updated))
  }, [])

  const requestSaveAsDefault = useCallback(() => {
    const frame = framesRef.current[currentIdxRef.current]
    if (!frame?.spriteId) return
    const sprite = sprites.find(s => s.id === frame.spriteId)
    const name = sprite?.name ?? '立绘'
    setDeleteModal({
      title: '保存为默认值',
      body: `将「${name}」的当前缩放/位置保存为默认值？`,
      confirmText: '保存',
      danger: false,
      onConfirm: handleSaveAsDefault,
    })
  }, [sprites, handleSaveAsDefault])

  // Global autoplay + min dwell（两者共存于同一设置对象，保存时一并写入避免互相覆盖）
  const handleAutoPlayChange = useCallback(async (val: number) => {
    setGlobalAutoPlay(val)
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify({ autoPlayInterval: val, minDwell: globalMinDwell }))
  }, [globalMinDwell])

  const handleMinDwellChange = useCallback(async (val: number) => {
    setGlobalMinDwell(val)
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify({ autoPlayInterval: globalAutoPlay, minDwell: val }))
  }, [globalAutoPlay])

  // Create new character
  const handleCreateChar = useCallback(async () => {
    const name = newCharName.trim()
    if (!name) return
    const newChar: CharRecord = { id: genId(), name, defaultSpriteId: null }
    const updated = [...chars, newChar]
    setChars(updated)
    await AsyncStorage.setItem(KEY_CHAR, JSON.stringify(updated))
    updateFrame({ characterId: newChar.id, spriteId: null })
    setNewCharModal(false)
    setNewCharName('')
  }, [newCharName, chars, updateFrame])

  return (
    <View style={S.root}>
      <StatusBar translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#050608', '#060809', '#050607', '#040508']}
        locations={[0, 0.4, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* 1 · Top bar */}
      <View style={S.topbar}>
        <View style={S.topbarInner}>
          <TouchableOpacity style={S.backBtn} onPress={handleBack} activeOpacity={0.7}>
            <Text style={S.backArrow}>‹</Text>
          </TouchableOpacity>
          <View style={S.tbBrand}>
            <View style={[S.tbLine, { transform: [{ scaleX: -1 }] }]} />
            <View style={S.tbGem} />
            <View style={S.tbLine} />
          </View>
          <Text style={S.topbarTitle} numberOfLines={1}>{chapterName}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={S.sortIconBtn} onPress={() => setSortVisible(true)} activeOpacity={0.7}>
            <View style={S.sortIconLine} />
            <View style={[S.sortIconLine, { width: 10 }]} />
            <View style={[S.sortIconLine, { width: 7 }]} />
          </TouchableOpacity>
          <TouchableOpacity style={S.previewPill} onPress={() => setShowPreview(true)} activeOpacity={0.7}>
            <Text style={S.previewPillText}>▶ 预览</Text>
          </TouchableOpacity>
        </View>
        <LinearGradient
          colors={['transparent', 'rgba(210,235,248,0.06)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={S.topbarBorderLine}
        />
      </View>

      {/* 2 · Frame strip */}
      <View style={S.strip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.stripContent}
        >
          {frames.map((frame, index) => (
            <FrameThumbItem
              key={frame.id}
              frame={frame} index={index}
              isActive={index === currentIdx}
              onPress={() => setCurrentIdx(index)}
            />
          ))}
          <TouchableOpacity style={S.addThumb} onPress={addFrameAtEnd} activeOpacity={0.6}>
            <Text style={S.addThumbText}>＋</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3 · Preview area */}
      <View style={S.previewArea}>
        <Text style={S.previewLabel}>PREVIEW</Text>
        <View style={S.previewMiniWrap}>
          <MiniPreview frames={frames} currentIdx={currentIdx} bgMap={bgMap} charMap={charMap} spriteMap={spriteMap} />
          <TouchableOpacity style={S.addAfterBtn} onPress={addFrameAfterCurrent} activeOpacity={0.7}>
            <Text style={S.addAfterBtnText}>＋</Text>
          </TouchableOpacity>
        </View>
        <View style={S.previewNav}>
          <TouchableOpacity
            style={[S.navBtn, currentIdx === 0 && S.navBtnDim]}
            onPress={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            activeOpacity={0.7}
          >
            <Text style={S.navBtnText}>‹ 上一帧</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.navBtn, currentIdx >= frames.length - 1 && S.navBtnDim]}
            onPress={() => setCurrentIdx(i => Math.min(frames.length - 1, i + 1))}
            disabled={currentIdx >= frames.length - 1}
            activeOpacity={0.7}
          >
            <Text style={S.navBtnText}>下一帧 ›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4+5 · Bottom panel */}
      <View style={S.bottomPanel}>
        <View style={S.tabBar}>
          {(['content', 'background', 'sprite', 'style'] as Tab[]).map((tab, i) => (
            <TouchableOpacity
              key={tab}
              style={[S.tabItem, i < 3 && S.tabItemBorder, activeTab === tab && S.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[S.tabLabel, activeTab === tab && S.tabLabelActive]}>
                {TAB_LABELS[tab]}
              </Text>
              {activeTab === tab && (
                <LinearGradient
                  colors={['transparent', 'rgba(210,235,248,0.55)', 'rgba(240,250,255,0.75)', 'rgba(210,235,248,0.55)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={S.tabUnderline}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView style={S.tabScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {activeTab === 'content' && (
            <ContentTab
              frame={currentFrame} chars={chars} sprites={sprites}
              onUpdate={updateFrame}
              canDelete={frames.length > 1}
              onDelete={requestDeleteFrame}
              onAddChar={() => setNewCharModal(true)}
            />
          )}
          {activeTab === 'background' && (
            <BackgroundTab
              frame={currentFrame} frames={frames} currentIdx={currentIdx}
              bgs={bgs}
              onUpdate={updateFrame}
              onImport={handleImportBg}
              onSync={() => setSyncPanel('background')}
            />
          )}
          {activeTab === 'sprite' && (
            <SpriteTab
              frame={currentFrame} frames={frames} currentIdx={currentIdx}
              sprites={sprites}
              onUpdate={updateFrame}
              onImport={handleImportSprite}
              onSync={() => setSyncPanel('sprite')}
              onSaveDefault={requestSaveAsDefault}
            />
          )}
          {activeTab === 'style' && (
            <StyleTab
              frame={currentFrame}
              globalAutoPlay={globalAutoPlay}
              globalMinDwell={globalMinDwell}
              onUpdate={updateFrame}
              onAutoPlayChange={handleAutoPlayChange}
              onMinDwellChange={handleMinDwellChange}
            />
          )}
          <View style={{ height: 8 }} />
        </ScrollView>
      </View>

      {/* Hard bottom bar */}
      <View style={S.hardBottomBar} />

      {/* Full-screen preview overlay */}
      {showPreview && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
          <PlayerScreen
            frames={frames}
            aspect={aspect}
            startIndex={Math.min(currentIdx, frames.length - 1)}
            onExit={() => setShowPreview(false)}
            autoPlayInterval={globalAutoPlay}
            minDwell={globalMinDwell}
          />
        </View>
      )}

      {/* Sort modal */}
      <SortModal
        visible={sortVisible} frames={frames}
        onReorder={handleReorder} onClose={() => setSortVisible(false)}
      />

      {/* Sync frame panel */}
      <SyncFramePanel
        visible={syncPanel !== null}
        title={syncPanel === 'background' ? '同步背景到后续帧' : '同步立绘到后续帧'}
        frames={frames} currentIdx={currentIdx}
        onConfirm={syncPanel === 'background' ? handleSyncBackground : handleSyncSprite}
        onClose={() => setSyncPanel(null)}
      />

      {/* New character modal */}
      {newCharModal && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <Pressable style={S.overlay} onPress={() => { setNewCharModal(false); setNewCharName('') }}>
            <Pressable style={S.modalBox} onPress={() => {}}>
              <LinearGradient
                colors={['transparent', 'rgba(210,235,248,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1, marginBottom: 22 }}
              />
              <Text style={[S.modalTitle, { color: 'rgba(210,235,248,0.7)', marginBottom: 16 }]}>
                新建角色
              </Text>
              <View style={S.newCharInputRow}>
                <TextInput
                  style={S.newCharInput}
                  value={newCharName}
                  onChangeText={setNewCharName}
                  placeholder="角色名称"
                  placeholderTextColor="rgba(135,175,205,0.36)"
                  selectionColor="rgba(210,235,248,0.5)"
                  autoFocus
                  maxLength={20}
                />
                <TouchableOpacity
                  style={[S.newCharConfirm, !newCharName.trim() && S.newCharConfirmDim]}
                  onPress={handleCreateChar}
                  activeOpacity={newCharName.trim() ? 0.7 : 1}
                >
                  <Text style={S.newCharConfirmText}>✓</Text>
                </TouchableOpacity>
              </View>
              <View style={[S.divider, { marginVertical: 20 }]} />
              <TouchableOpacity
                style={[S.btn, S.btnSecondary]}
                onPress={() => { setNewCharModal(false); setNewCharName('') }}
                activeOpacity={0.7}
              >
                <Text style={S.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Delete / info / confirm modal */}
      {deleteModal && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <Pressable style={S.overlay} onPress={() => setDeleteModal(null)}>
            <Pressable style={S.modalBox} onPress={() => {}}>
              <LinearGradient
                colors={deleteModal.onConfirm && deleteModal.danger !== false
                  ? ['transparent', 'rgba(200,100,100,0.35)', 'transparent']
                  : ['transparent', 'rgba(210,235,248,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1, marginBottom: 22 }}
              />
              <Text style={[S.modalTitle, {
                color: deleteModal.onConfirm && deleteModal.danger !== false
                  ? 'rgba(215,155,145,0.9)' : 'rgba(210,235,248,0.7)',
                marginBottom: 10,
              }]}>
                {deleteModal.title}
              </Text>
              <Text style={S.modalBody}>{deleteModal.body}</Text>
              <View style={[S.divider, { marginVertical: 20 }]} />
              <View style={S.btnRow}>
                <TouchableOpacity
                  style={[S.btn, S.btnSecondary]}
                  onPress={() => setDeleteModal(null)}
                  activeOpacity={0.7}
                >
                  <Text style={S.btnSecondaryText}>
                    {deleteModal.onConfirm ? '取消' : '知道了'}
                  </Text>
                </TouchableOpacity>
                {deleteModal.onConfirm && (
                  <TouchableOpacity
                    style={[S.btn, deleteModal.danger === false ? S.btnSave : S.btnDanger]}
                    onPress={() => { deleteModal.onConfirm!(); setDeleteModal(null) }}
                    activeOpacity={0.7}
                  >
                    <Text style={deleteModal.danger === false ? S.btnSaveText : S.btnDangerText}>
                      {deleteModal.confirmText ?? '删除'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#040508' },

  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: STATUS_H + TOPBAR_H, paddingTop: STATUS_H,
    zIndex: 10,
    backgroundColor: 'rgba(3,5,10,0.62)',
  },
  topbarInner: {
    height: TOPBAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(3,5,10,0.38)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 22, color: 'rgba(210,235,248,0.7)', lineHeight: 26, marginTop: -1 },
  tbBrand: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 2 },
  tbGem: { width: 5, height: 5, backgroundColor: 'rgba(210,235,248,0.8)', transform: [{ rotate: '45deg' }] },
  tbLine: { width: 14, height: 1, backgroundColor: 'rgba(210,235,248,0.35)' },
  topbarTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 1.4, color: 'rgba(225,238,250,0.92)' },
  topbarBorderLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 },

  sortIconBtn: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.16)',
    backgroundColor: 'rgba(210,235,248,0.04)',
    alignItems: 'center', justifyContent: 'center', gap: 3.5,
  },
  sortIconLine: { width: 13, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(210,235,248,0.5)' },
  previewPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.26)',
    backgroundColor: 'rgba(210,235,248,0.06)',
  },
  previewPillText: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(210,235,248,0.85)' },

  strip: {
    marginTop: STATUS_H + TOPBAR_H, height: STRIP_H,
    backgroundColor: 'rgba(4,6,12,0.94)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.06)',
    overflow: 'hidden',
  },
  stripContent: { paddingHorizontal: STRIP_PAD, alignItems: 'center', minHeight: STRIP_H },
  thumbWrap: { width: THUMB_ITEM_W, paddingVertical: 7, paddingHorizontal: 5, alignItems: 'center', gap: 4, borderRadius: 7 },
  thumbWrapActive: { backgroundColor: 'rgba(210,235,248,0.05)' },
  thumbImg: {
    width: THUMB_W, height: THUMB_H_IMG, borderRadius: 5, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: 'rgba(5,6,10,0.9)',
  },
  thumbImgActive: {
    borderColor: 'rgba(210,235,248,0.38)',
    shadowColor: 'rgba(180,220,245,1)', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  thumbActiveDot: {
    position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(210,235,248,0.85)',
  },
  thumbCharSil: {
    position: 'absolute', bottom: 6, alignSelf: 'center',
    width: 18, height: 30, backgroundColor: 'rgba(210,235,248,0.06)', borderRadius: 9,
  },
  thumbDlgBar: {
    position: 'absolute', bottom: 2, left: 2, right: 2, height: 14,
    backgroundColor: 'rgba(3,6,12,0.55)', borderRadius: 2,
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.22)',
  },
  thumbNarrBar: {
    position: 'absolute', bottom: 2, left: 2, right: 2, height: 14,
    backgroundColor: 'rgba(3,5,10,0.5)', borderRadius: 2,
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.15)',
  },
  thumbEmphasisWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  thumbEmphasisText: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)' },
  thumbLetterboxTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: 'rgba(210,235,248,0.1)' },
  thumbLetterboxBot: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, backgroundColor: 'rgba(210,235,248,0.1)' },
  thumbNum: { fontSize: 8, letterSpacing: 0.4, color: 'rgba(135,175,205,0.36)' },
  thumbNumActive: { color: 'rgba(210,235,248,0.7)', fontWeight: '600' },
  addThumb: {
    width: THUMB_W, height: THUMB_H_IMG, marginLeft: 8,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(210,235,248,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  addThumbText: { fontSize: 18, color: 'rgba(135,175,205,0.36)' },

  previewArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 12, gap: 10 },
  previewLabel: { fontSize: 7.5, letterSpacing: 3.6, color: 'rgba(135,175,205,0.36)' },
  miniPhone: {
    width: MINI_W, height: MINI_H,
    borderRadius: Math.round(MINI_W * 0.13), overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
  },
  miniSprite: {
    position: 'absolute', bottom: MINI_SPRITE_BOT, left: 0,
    width: MINI_W, height: Math.round(MINI_H * 0.88),
  },
  miniFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.round(MINI_H * 0.42) },
  miniDlgBox: {
    position: 'absolute', bottom: MINI_DLG_BOT, left: 0, right: 0,
    backgroundColor: 'rgba(3,6,12,0.26)',
    paddingTop: 7, paddingBottom: 5, paddingHorizontal: Math.round(MINI_W * 0.1),
  },
  miniNamebar: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  miniGem: { width: 3, height: 3, backgroundColor: '#eef6fc', transform: [{ rotate: '45deg' }] },
  miniName: {
    fontSize: 5.5, letterSpacing: 1.6, fontWeight: '600', color: '#eef6fc',
    paddingBottom: 1.5, borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.42)',
  },
  miniDlgText: { fontSize: 4.5, lineHeight: 8, color: 'rgba(230,242,250,0.88)', letterSpacing: 0.3 },
  miniNarrBox: {
    position: 'absolute', bottom: MINI_DLG_BOT, left: 0, right: 0,
    backgroundColor: 'rgba(3,5,10,0.45)',
    paddingVertical: 5, paddingHorizontal: Math.round(MINI_W * 0.1),
  },
  miniNarrText: { fontSize: 4.5, lineHeight: 8, color: 'rgba(210,235,248,0.75)', letterSpacing: 0.2 },
  miniEmphasisBox: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  miniEmphasisText: { fontSize: Math.round(MINI_W * 0.2), fontWeight: '600', letterSpacing: 3, color: 'rgba(230,242,250,0.92)' },
  previewMiniWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    height: MINI_H,
    position: 'relative',
  },
  addAfterBtn: {
    position: 'absolute',
    right: Math.round((SCREEN_W - MINI_W) / 4 - THUMB_W / 2),
    top: Math.round(MINI_H / 2 - THUMB_H_IMG / 2),
    width: THUMB_W, height: THUMB_H_IMG,
    borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(135,175,205,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  addAfterBtnText: { fontSize: 18, color: 'rgba(135,175,205,0.36)' },
  previewNav: { flexDirection: 'row', gap: 10 },
  navBtn: {
    paddingVertical: 5, paddingHorizontal: 14, borderRadius: 5,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  navBtnDim: { opacity: 0.35 },
  navBtnText: { fontSize: 10, letterSpacing: 0.6, color: 'rgba(185,215,235,0.58)' },

  bottomPanel: {
    flex: 1, backgroundColor: 'rgba(3,5,10,0.97)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.06)',
  },
  hardBottomBar: {
    height: HARD_BOT_H, backgroundColor: 'rgba(3,5,10,0.97)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.04)',
  },
  tabBar: { height: TABBAR_H, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.08)' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabItemBorder: { borderRightWidth: 1, borderRightColor: 'rgba(210,235,248,0.08)' },
  tabItemActive: {},
  tabLabel: { fontSize: 10.5, letterSpacing: 0.6, color: 'rgba(135,175,205,0.36)' },
  tabLabelActive: { color: 'rgba(210,235,248,0.82)' },
  tabUnderline: { position: 'absolute', bottom: 0, left: '18%', right: '18%', height: 1 },
  tabScroll: { flex: 1 },

  section: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.05)',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionGem: { width: 4, height: 4, backgroundColor: 'rgba(210,235,248,0.38)', transform: [{ rotate: '45deg' }] },
  sectionTitle: { fontSize: 8.5, letterSpacing: 2, color: 'rgba(135,175,205,0.36)' },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(210,235,248,0.08)' },

  // Type selector
  typeCol: { gap: 6 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    borderRadius: 7, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(210,235,248,0.03)',
  },
  typeOpt: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    borderRadius: 7, paddingVertical: 10, paddingHorizontal: 4,
    alignItems: 'center', backgroundColor: 'rgba(210,235,248,0.03)',
  },
  typeOptSel: { borderColor: 'rgba(210,235,248,0.28)', backgroundColor: 'rgba(210,235,248,0.07)' },
  typeIcon: { fontSize: 15, marginBottom: 5, color: 'rgba(210,235,248,0.55)', letterSpacing: 0.5 },
  typeIconSel: { color: 'rgba(210,235,248,0.92)' },
  typeLabel: { fontSize: 9.5, color: 'rgba(185,215,235,0.58)', letterSpacing: 0.5 },
  typeLabelSel: { color: 'rgba(210,235,248,0.82)' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: 'rgba(210,235,248,0.03)',
  },
  chipSel: { borderColor: 'rgba(210,235,248,0.28)', backgroundColor: 'rgba(210,235,248,0.07)' },
  chipAvatar: {
    width: 17, height: 17, borderRadius: 8.5,
    backgroundColor: 'rgba(210,235,248,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  chipAvatarText: { fontSize: 8, color: 'rgba(210,235,248,0.55)' },
  chipText: { fontSize: 11, color: 'rgba(185,215,235,0.58)' },
  chipTextSel: { color: 'rgba(210,235,248,0.85)' },
  chipAdd: {
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: 'rgba(210,235,248,0.03)',
  },
  chipAddText: { fontSize: 10.5, color: 'rgba(135,175,205,0.45)', letterSpacing: 0.5 },

  // Text input
  textWrap: { position: 'relative' },
  textInput: {
    minHeight: 88, maxHeight: 140,
    backgroundColor: 'rgba(3,6,14,0.5)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    borderRadius: 7, padding: 10, paddingBottom: 24,
    fontSize: 13, letterSpacing: 0.4, lineHeight: 22,
    color: 'rgba(225,238,250,0.92)',
  },
  charCount: { position: 'absolute', bottom: 8, right: 10, fontSize: 8.5, color: 'rgba(135,175,205,0.36)' },

  // Toggle
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 11.5, color: 'rgba(185,215,235,0.58)' },
  toggleSub: { fontSize: 9, color: 'rgba(135,175,205,0.36)', marginTop: 2, letterSpacing: 0.3 },
  toggle: {
    width: 34, height: 19, borderRadius: 10,
    backgroundColor: '#060809',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: 'rgba(210,235,248,0.16)', borderColor: 'rgba(210,235,248,0.28)' },
  toggleKnob: {
    position: 'absolute', left: 3, width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: 'rgba(210,235,248,0.28)',
  },
  toggleKnobOn: { left: 17, backgroundColor: 'rgba(220,240,255,0.9)' },

  // Delete frame button
  deleteFrameBtn: {
    height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,110,110,0.32)',
    backgroundColor: 'rgba(200,80,80,0.05)',
  },
  deleteFrameBtnDisabled: { borderColor: 'rgba(255,110,110,0.1)', backgroundColor: 'rgba(200,80,80,0.02)' },
  deleteFrameBtnText: { fontSize: 11.5, letterSpacing: 1.5, color: 'rgba(220,140,130,0.75)' },
  deleteFrameBtnTextDisabled: { color: 'rgba(220,140,130,0.3)' },

  // Asset grid (background tab)
  assetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assetCell: {
    width: ASSET_W, height: ASSET_H, borderRadius: 7, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: '#080a12',
  },
  assetCellSel: { borderColor: 'rgba(210,235,248,0.38)', borderWidth: 2 },
  assetBuiltinLabel: { fontSize: 8, letterSpacing: 0.5, color: 'rgba(210,235,248,0.25)' },
  assetBuiltinLabelDark: { fontSize: 8, letterSpacing: 0.5, color: 'rgba(30,30,40,0.4)' },
  assetCheck: {
    position: 'absolute', top: 3, right: 3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(210,235,248,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  assetCheckText: { fontSize: 7.5, color: '#04060c', fontWeight: '700' },
  assetAddCell: {
    width: ASSET_W, height: ASSET_H, borderRadius: 7,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(210,235,248,0.1)',
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  assetAddIcon: { fontSize: 17, color: 'rgba(135,175,205,0.36)' },
  assetAddText: { fontSize: 8, color: 'rgba(135,175,205,0.36)', letterSpacing: 0.4 },

  // Sprite cells (taller)
  spriteCell: {
    width: ASSET_W, height: SPRITE_CELL_H, borderRadius: 7, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: '#080a12',
  },
  spriteAddCell: {
    width: ASSET_W, height: SPRITE_CELL_H, borderRadius: 7,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(210,235,248,0.1)',
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  spriteNoneIcon: { fontSize: 20, color: 'rgba(210,235,248,0.22)' },
  spriteNoneLabel: { fontSize: 7, color: 'rgba(210,235,248,0.28)', marginTop: 4, letterSpacing: 0.5 },

  // Action buttons
  actionBtn: {
    height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  actionBtnDim: { opacity: 0.35 },
  actionBtnText: { fontSize: 10.5, letterSpacing: 0.8, color: 'rgba(185,215,235,0.58)' },

  // Sync button
  syncBtn: {
    height: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 5,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  syncBtnText: { fontSize: 10.5, letterSpacing: 0.8, color: 'rgba(185,215,235,0.58)' },

  // Double button row (恢复默认 / 保存为默认值)
  doubleBtn: { flexDirection: 'row', gap: 6 },
  doubleBtnItem: {
    flex: 1, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  doubleBtnRight: { borderColor: 'rgba(210,235,248,0.22)' },
  doubleBtnText: { fontSize: 10, letterSpacing: 0.8, color: 'rgba(185,215,235,0.58)' },

  // Stepper row
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  stepperLabel: { fontSize: 11.5, color: 'rgba(185,215,235,0.58)' },
  stepperHint: { fontSize: 9, color: 'rgba(135,175,205,0.36)', marginTop: 2, letterSpacing: 0.3 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 28, height: 28,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    backgroundColor: 'rgba(210,235,248,0.04)',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 5,
  },
  stepBtnText: { fontSize: 14, color: 'rgba(185,215,235,0.7)', lineHeight: 18 },
  stepNum: {
    width: 38, height: 28,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    backgroundColor: 'rgba(3,6,14,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, color: 'rgba(225,238,250,0.88)', letterSpacing: 0.3 },

  // Style tab – color opts
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorOpt: { width: 34, height: 34, borderRadius: 7, borderWidth: 2, borderColor: 'transparent' },
  colorOptSel: { borderColor: 'rgba(210,235,248,0.5)' },
  colorHint: { fontSize: 9.5, color: 'rgba(135,175,205,0.36)', letterSpacing: 0.3 },

  // Style tab – align opts
  alignRow: { flexDirection: 'row', gap: 6 },
  alignOpt: {
    flex: 1, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
    backgroundColor: 'rgba(210,235,248,0.03)',
  },
  alignOptSel: { borderColor: 'rgba(210,235,248,0.28)', backgroundColor: 'rgba(210,235,248,0.07)' },
  alignOptText: { fontSize: 10, color: 'rgba(185,215,235,0.58)', letterSpacing: 0.3 },
  alignOptTextSel: { color: 'rgba(210,235,248,0.85)' },

  // Global badge
  globalBadge: {
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)', borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4,
  },
  globalBadgeText: { fontSize: 8, letterSpacing: 1.2, color: 'rgba(210,235,248,0.35)' },

  // Sync frame panel
  syncPanelOuter: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: BOTTOM_PANEL_H,
    backgroundColor: 'rgba(4,6,10,0.98)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.1)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  syncPanelHead: {
    height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.08)',
  },
  syncPanelTitle: { fontSize: 10.5, letterSpacing: 1.8, color: 'rgba(185,215,235,0.7)' },
  syncPanelCancel: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(135,175,205,0.5)' },
  syncSelectAll: {
    margin: 10, marginBottom: 6, height: 36, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    backgroundColor: 'rgba(210,235,248,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncSelectAllActive: { borderColor: 'rgba(210,235,248,0.28)' },
  syncSelectAllText: { fontSize: 10, letterSpacing: 1, color: 'rgba(210,235,248,0.7)' },
  syncFrameItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.05)',
  },
  syncCheck: {
    width: 16, height: 16, borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.2)',
    backgroundColor: 'rgba(210,235,248,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncCheckSel: { backgroundColor: 'rgba(210,235,248,0.14)', borderColor: 'rgba(210,235,248,0.4)' },
  syncCheckMark: { fontSize: 9, color: 'rgba(210,235,248,0.85)' },
  syncFrameThumb: {
    width: 24, height: 32, borderRadius: 3,
    backgroundColor: '#050608', borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)',
  },
  syncFrameNum: { fontSize: 10, color: 'rgba(185,215,235,0.65)', letterSpacing: 0.5 },
  syncFrameType: { fontSize: 8.5, color: 'rgba(135,175,205,0.36)', letterSpacing: 0.4, marginTop: 1 },
  syncEmptyHint: { textAlign: 'center', fontSize: 10, color: 'rgba(135,175,205,0.3)', marginTop: 32, letterSpacing: 1 },
  syncPanelFoot: {
    height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.08)',
  },
  syncHardBot: {
    height: 44, backgroundColor: 'rgba(4,6,10,0.98)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.04)',
  },
  syncCount: { fontSize: 9, color: 'rgba(135,175,205,0.36)', letterSpacing: 0.6, minWidth: 52 },
  syncConfirmBtn: {
    flex: 1, height: 36, borderRadius: 6,
    backgroundColor: 'rgba(210,235,248,0.08)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncConfirmBtnDim: { opacity: 0.35 },
  syncConfirmBtnText: { fontSize: 10.5, letterSpacing: 1, color: 'rgba(210,235,248,0.85)' },

  // Sort modal
  sortBox: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: BOTTOM_PANEL_H,
    backgroundColor: 'rgba(4,7,14,0.98)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.1)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  sortHardBot: {
    height: 44, backgroundColor: 'rgba(4,7,14,0.98)',
    borderTopWidth: 1, borderTopColor: 'rgba(210,235,248,0.04)',
  },
  sortHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  sortHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sortTitle: { fontSize: 13, letterSpacing: 2.4, fontWeight: '600', color: 'rgba(225,238,250,0.85)' },
  sortCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(210,235,248,0.05)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  sortCloseText: { fontSize: 10, color: 'rgba(210,235,248,0.5)' },
  sortHint: { fontSize: 8.5, letterSpacing: 1.5, color: 'rgba(135,175,205,0.36)', marginBottom: 10 },
  sortRow: {
    height: SORT_ROW_H, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.05)', gap: 10,
  },
  sortRowNum: { width: 22, fontSize: 10, fontWeight: '600', color: 'rgba(135,175,205,0.5)', letterSpacing: 0.5 },
  sortRowBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  sortRowBadgeEmph: { borderColor: 'rgba(210,235,248,0.22)', backgroundColor: 'rgba(210,235,248,0.08)' },
  sortRowBadgeNarr: { borderColor: 'rgba(180,210,235,0.1)' },
  sortRowBadgeText: { fontSize: 8.5, letterSpacing: 1.2, color: 'rgba(185,215,235,0.65)' },
  sortRowText: { flex: 1, fontSize: 11.5, color: 'rgba(210,235,248,0.55)', letterSpacing: 0.3 },
  sortHandle: { width: 44, height: SORT_ROW_H, alignItems: 'center', justifyContent: 'center', gap: 4 },
  sortHandleLine: { width: 18, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(210,235,248,0.28)' },
  sortInsertLine: {
    height: 2, marginHorizontal: 12, borderRadius: 1,
    backgroundColor: 'rgba(210,235,248,0.5)',
    shadowColor: 'rgba(210,235,248,1)', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  sortGhost: {
    position: 'absolute', top: 0, left: 0, right: 0, height: SORT_ROW_H,
    backgroundColor: 'rgba(210,235,248,0.07)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.22)', elevation: 8,
  },

  // Modals (delete / info / new-char)
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  modalBox: {
    width: SCREEN_W - 64,
    backgroundColor: 'rgba(4,7,14,0.97)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    borderRadius: 12, padding: 24,
  },
  modalTitle: { fontSize: 14, letterSpacing: 2.4, fontWeight: '600', textAlign: 'center' },
  modalBody: { fontSize: 11, letterSpacing: 1.5, lineHeight: 18, color: 'rgba(210,235,248,0.45)', textAlign: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(210,235,248,0.07)' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  btnSecondary: { borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)', backgroundColor: 'rgba(210,235,248,0.04)' },
  btnSecondaryText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.5)' },
  btnDanger: { borderWidth: 1, borderColor: 'rgba(210,100,100,0.3)', backgroundColor: 'rgba(200,80,80,0.1)' },
  btnDangerText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(215,150,140,0.9)' },
  btnSave: { borderWidth: 1, borderColor: 'rgba(210,235,248,0.28)', backgroundColor: 'rgba(210,235,248,0.08)' },
  btnSaveText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.85)' },

  // New character modal input
  newCharInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newCharInput: {
    flex: 1, height: 40,
    backgroundColor: 'rgba(3,6,14,0.5)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    borderRadius: 7, paddingHorizontal: 12,
    fontSize: 13, color: 'rgba(225,238,250,0.92)',
  },
  newCharConfirm: {
    width: 40, height: 40, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.28)',
    backgroundColor: 'rgba(210,235,248,0.08)',
  },
  newCharConfirmDim: { borderColor: 'rgba(210,235,248,0.1)', backgroundColor: 'rgba(210,235,248,0.03)' },
  newCharConfirmText: { fontSize: 16, color: 'rgba(210,235,248,0.85)' },
})
