import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Pressable, ScrollView,
  StyleSheet, StatusBar, TextInput, Modal, Image, Dimensions, BackHandler,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BgRecord {
  id: string
  uri: string   // 'builtin_black' | 'builtin_white' | file:// URI
  name: string
}

export interface SpriteRecord {
  id: string
  uri: string
  name: string
}

export interface CharRecord {
  id: string
  name: string
  defaultSpriteId: string | null
}

interface FrameRef { backgroundId?: string | null; spriteId?: string | null; characterId?: string | null }
interface ChapterRef { frames: FrameRef[] }
interface ProjectRef { chapters: ChapterRef[] }

// ── Layout ────────────────────────────────────────────────────────────────────
const STATUS_H    = StatusBar.currentHeight ?? 24
const TOPBAR_H    = 72
const TABS_H      = 44
const BOT_NAV_H   = 96
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('screen')
const GRID_PAD    = 24
const GRID_GAP    = 10
const THUMB_W     = (SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2
const THUMB_H     = THUMB_W * (16 / 9)
const CONTENT_TOP = STATUS_H + TOPBAR_H + TABS_H

type Tab = 'backgrounds' | 'sprites' | 'characters'
const TAB_LABELS: Record<Tab, string> = {
  backgrounds: '背景库',
  sprites:     '立绘库',
  characters:  '角色库',
}

// ── Storage ───────────────────────────────────────────────────────────────────
const KEY_BG   = 'library_backgrounds_v1'
const KEY_SP   = 'library_sprites_v1'
const KEY_CHAR = 'library_characters_v1'
const KEY_PROJ = 'projects_v1'

const BG_DIR     = (FileSystem.documentDirectory ?? '') + 'library/backgrounds/'
const SPRITE_DIR = (FileSystem.documentDirectory ?? '') + 'library/sprites/'

const BUILTIN: BgRecord[] = [
  { id: 'builtin_black', uri: 'builtin_black', name: '纯黑' },
  { id: 'builtin_white', uri: 'builtin_white', name: '纯白' },
]

async function load<T>(key: string): Promise<T[]> {
  try { const r = await AsyncStorage.getItem(key); return r ? JSON.parse(r) : [] }
  catch { return [] }
}
const save = (key: string, data: unknown[]) => AsyncStorage.setItem(key, JSON.stringify(data))

async function isInUse(type: 'background' | 'sprite' | 'character', id: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PROJ)
    if (!raw) return false
    const projects: ProjectRef[] = JSON.parse(raw)
    for (const proj of projects)
      for (const chap of proj.chapters)
        for (const fr of chap.frames) {
          if (type === 'background' && fr.backgroundId === id) return true
          if (type === 'sprite'     && fr.spriteId     === id) return true
          if (type === 'character'  && fr.characterId  === id) return true
        }
    return false
  } catch { return false }
}

async function ensureDirs() {
  await FileSystem.makeDirectoryAsync(BG_DIR,     { intermediates: true })
  await FileSystem.makeDirectoryAsync(SPRITE_DIR, { intermediates: true })
}

async function reqPerm(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  return status === 'granted'
}

async function pickAndCopy(destDir: string, opts: Partial<ImagePicker.ImagePickerOptions>): Promise<string | null> {
  if (!(await reqPerm())) return null
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 1, ...opts })
  if (res.canceled || !res.assets[0]) return null
  const destUri = destDir + Date.now() + '.jpg'
  await FileSystem.copyAsync({ from: res.assets[0].uri, to: destUri })
  return destUri
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function PersonIcon({ size = 18, opacity = 0.18 }: { size?: number; opacity?: number }) {
  const c = `rgba(210,235,248,${opacity})`
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={9} cy={6} r={3} stroke={c} strokeWidth={1.2} />
      <Path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={c} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  )
}

function PlusIcon({ color = 'rgba(210,235,248,0.28)' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="M7 2v10M2 7h10" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  )
}

function CheckIcon({ color = 'rgba(210,235,248,0.85)', size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M2 7l4 4 6-6" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function PencilIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
      <Path d="M9.5 2.5l2 2-8 8H2v-2l8-8z" stroke="rgba(210,235,248,0.55)" strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  )
}

function TrashIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
      <Path d="M2 4h10M5 4V2.5h4V4M6 7v4M8 7v4M3 4l.8 8h6.4L11 4" stroke="rgba(210,120,120,0.7)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? 'rgba(210,235,248,0.8)' : 'rgba(210,235,248,0.28)'
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path d="M3 10.5L10 3l7 7.5V18H13v-5H7v5H3V10.5z" stroke={c} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  )
}

function GridIcon({ active }: { active: boolean }) {
  const c = active ? 'rgba(210,235,248,0.8)' : 'rgba(210,235,248,0.28)'
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={3} width={6} height={6} rx={1} stroke={c} strokeWidth={1.2} />
      <Rect x={11} y={3} width={6} height={6} rx={1} stroke={c} strokeWidth={1.2} />
      <Rect x={3} y={11} width={6} height={6} rx={1} stroke={c} strokeWidth={1.2} />
      <Rect x={11} y={11} width={6} height={6} rx={1} stroke={c} strokeWidth={1.2} />
    </Svg>
  )
}

function TabGem() {
  return (
    <View style={{ width: 4, height: 4, backgroundColor: 'rgba(210,235,248,0.65)',
      transform: [{ rotate: '45deg' }], marginRight: 4 }} />
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function LibraryScreen({ onBack }: { onBack?: () => void }) {
  const [activeTab, setActiveTab]     = useState<Tab>('backgrounds')
  const [bgs,     setBgs]             = useState<BgRecord[]>([])
  const [sprites, setSprites]         = useState<SpriteRecord[]>([])
  const [chars,   setChars]           = useState<CharRecord[]>([])
  const [selBgId,     setSelBgId]     = useState<string | null>(null)
  const [selSpriteId, setSelSpriteId] = useState<string | null>(null)

  // New-character modal
  const [newCharVisible, setNewCharVisible] = useState(false)
  const [newCharName,    setNewCharName]    = useState('')

  // Edit-character modal
  const [editChar,     setEditChar]     = useState<CharRecord | null>(null)
  const [editCharName, setEditCharName] = useState('')

  // Long-press action sheet (bg / sprite / character)
  const [actionTarget, setActionTarget] = useState<{
    type: 'bg' | 'sprite' | 'character'
    item: BgRecord | SpriteRecord | CharRecord
  } | null>(null)

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<{
    type: 'bg' | 'sprite'
    item: BgRecord | SpriteRecord
  } | null>(null)
  const [renameText, setRenameText] = useState('')

  // Frost delete-confirm modal — onConfirm undefined → info-only ("知道了")
  const [deleteModal, setDeleteModal] = useState<{
    title: string
    body: string
    onConfirm?: () => Promise<void>
  } | null>(null)

  const onBackRef   = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current?.()
      return true
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    ensureDirs().catch(console.error)
    load<BgRecord>(KEY_BG).then(setBgs)
    load<SpriteRecord>(KEY_SP).then(setSprites)
    load<CharRecord>(KEY_CHAR).then(setChars)
  }, [])

  useEffect(() => {
    if (editChar) setEditCharName(editChar.name)
  }, [editChar?.id])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showDelete = useCallback((
    title: string, body: string, onConfirm?: () => Promise<void>
  ) => setDeleteModal({ title, body, onConfirm }), [])

  // ── Background handlers ────────────────────────────────────────────────────
  const handleImportBg = useCallback(async () => {
    await ensureDirs()
    const uri = await pickAndCopy(BG_DIR, { allowsEditing: true, aspect: [3, 4] })
    if (!uri) return
    const rec: BgRecord = { id: Date.now().toString(), uri, name: `背景 ${bgs.length + 1}` }
    const next = [...bgs, rec]
    setBgs(next); await save(KEY_BG, next)
  }, [bgs])

  const handleDeleteBg = useCallback(async (bg: BgRecord) => {
    if (await isInUse('background', bg.id)) {
      showDelete('无法删除', '该背景正在项目中使用，请先移除引用后再删除。')
      return
    }
    showDelete('删除背景', `确定删除「${bg.name}」？此操作不可恢复。`, async () => {
      try { await FileSystem.deleteAsync(bg.uri, { idempotent: true }) } catch {}
      const next = bgs.filter(b => b.id !== bg.id)
      setBgs(next); await save(KEY_BG, next)
      if (selBgId === bg.id) setSelBgId(null)
    })
  }, [bgs, selBgId, showDelete])

  const handleRenameBg = useCallback(async (id: string, name: string) => {
    const next = bgs.map(b => b.id === id ? { ...b, name } : b)
    setBgs(next); await save(KEY_BG, next)
  }, [bgs])

  // ── Sprite handlers ────────────────────────────────────────────────────────
  const handleImportSprite = useCallback(async () => {
    await ensureDirs()
    const uri = await pickAndCopy(SPRITE_DIR, { allowsEditing: true })
    if (!uri) return
    const rec: SpriteRecord = { id: Date.now().toString(), uri, name: `立绘 ${sprites.length + 1}` }
    const next = [...sprites, rec]
    setSprites(next); await save(KEY_SP, next)
  }, [sprites])

  const handleDeleteSprite = useCallback(async (sp: SpriteRecord) => {
    if (await isInUse('sprite', sp.id)) {
      showDelete('无法删除', '该立绘正在项目中使用，请先移除引用后再删除。')
      return
    }
    showDelete('删除立绘', `确定删除「${sp.name}」？此操作不可恢复。`, async () => {
      try { await FileSystem.deleteAsync(sp.uri, { idempotent: true }) } catch {}
      const nextChars = chars.map(c =>
        c.defaultSpriteId === sp.id ? { ...c, defaultSpriteId: null } : c
      )
      setChars(nextChars); await save(KEY_CHAR, nextChars)
      const next = sprites.filter(s => s.id !== sp.id)
      setSprites(next); await save(KEY_SP, next)
      if (selSpriteId === sp.id) setSelSpriteId(null)
    })
  }, [sprites, chars, selSpriteId, showDelete])

  const handleRenameSprite = useCallback(async (id: string, name: string) => {
    const next = sprites.map(s => s.id === id ? { ...s, name } : s)
    setSprites(next); await save(KEY_SP, next)
  }, [sprites])

  // ── Character handlers ─────────────────────────────────────────────────────
  const handleCreateChar = useCallback(async () => {
    const name = newCharName.trim()
    if (!name) return
    const rec: CharRecord = { id: Date.now().toString(), name, defaultSpriteId: null }
    const next = [...chars, rec]
    setChars(next); await save(KEY_CHAR, next)
    setNewCharVisible(false); setNewCharName('')
  }, [newCharName, chars])

  const handleConfirmCharName = useCallback(async () => {
    if (!editChar) return
    const name = editCharName.trim()
    if (!name || name === editChar.name) return
    const next = chars.map(c => c.id === editChar.id ? { ...c, name } : c)
    setChars(next); await save(KEY_CHAR, next)
    setEditChar(prev => prev ? { ...prev, name } : null)
  }, [editChar, editCharName, chars])

  const handleSelectDefaultSprite = useCallback(async (spriteId: string | null) => {
    if (!editChar) return
    const next = chars.map(c => c.id === editChar.id ? { ...c, defaultSpriteId: spriteId } : c)
    setChars(next); await save(KEY_CHAR, next)
    setEditChar(prev => prev ? { ...prev, defaultSpriteId: spriteId } : null)
  }, [editChar, chars])

  const handleDeleteCharDirect = useCallback(async (char: CharRecord) => {
    if (await isInUse('character', char.id)) {
      showDelete('无法删除', '该角色正在项目中使用，请先移除引用后再删除。')
      return
    }
    showDelete('删除角色', `确定删除「${char.name}」？此操作不可恢复。`, async () => {
      const next = chars.filter(c => c.id !== char.id)
      setChars(next); await save(KEY_CHAR, next)
    })
  }, [chars, showDelete])

  // ── Long-press → action sheet ──────────────────────────────────────────────
  const handleThumbLongPress = useCallback((type: 'bg' | 'sprite', item: BgRecord | SpriteRecord) => {
    setActionTarget({ type, item })
  }, [])

  // ── Rename confirm ─────────────────────────────────────────────────────────
  const handleRenameConfirm = useCallback(async () => {
    if (!renameTarget) return
    const name = renameText.trim()
    if (!name) return
    if (renameTarget.type === 'bg') await handleRenameBg(renameTarget.item.id, name)
    else await handleRenameSprite(renameTarget.item.id, name)
    setRenameTarget(null)
  }, [renameTarget, renameText, handleRenameBg, handleRenameSprite])

  // ── Render: thumbnail ──────────────────────────────────────────────────────
  const renderThumb = (
    item: BgRecord | SpriteRecord,
    isSelected: boolean,
    onTap: () => void,
    type: 'bg' | 'sprite',
    allowLongPress: boolean
  ) => {
    const isBuiltin = item.uri === 'builtin_black' || item.uri === 'builtin_white'
    const isWhite   = item.uri === 'builtin_white'
    const isBlack   = item.uri === 'builtin_black'
    return (
      <TouchableOpacity
        key={item.id}
        style={[S.thumb, isSelected && S.thumbSelected]}
        onPress={onTap}
        onLongPress={allowLongPress && !isBuiltin ? () => handleThumbLongPress(type, item) : undefined}
        delayLongPress={400}
        activeOpacity={0.8}
      >
        {isBuiltin ? (
          <View style={[S.thumbFill, { backgroundColor: isBlack ? '#000' : '#fff',
            alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 9, letterSpacing: 2,
              color: isBlack ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)' }}>
              {item.name}
            </Text>
          </View>
        ) : (
          <Image source={{ uri: item.uri }} style={S.thumbFill}
            resizeMode={type === 'sprite' ? 'contain' : 'cover'} />
        )}
        <LinearGradient
          colors={isWhite
            ? ['transparent', 'rgba(160,160,160,0.45)']
            : ['transparent', 'rgba(3,5,10,0.75)']}
          style={S.thumbLabel}
        >
          <Text style={[S.thumbLabelText, isWhite && { color: 'rgba(0,0,0,0.38)' }]} numberOfLines={1}>
            {item.name}
          </Text>
        </LinearGradient>
        {!isBuiltin && allowLongPress && (
          <View style={S.thumbHint}><Text style={S.thumbHintText}>长按操作</Text></View>
        )}
      </TouchableOpacity>
    )
  }

  const renderGrid = (
    items: (BgRecord | SpriteRecord)[],
    selId: string | null,
    onTap: (item: BgRecord | SpriteRecord) => void,
    type: 'bg' | 'sprite',
    allowLongPress: boolean
  ) => {
    const rows: (BgRecord | SpriteRecord)[][] = []
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
    return rows.map((row, idx) => (
      <View key={idx} style={S.gridRow}>
        {renderThumb(row[0], selId === row[0].id, () => onTap(row[0]), type, allowLongPress)}
        {row[1]
          ? renderThumb(row[1], selId === row[1].id, () => onTap(row[1]), type, allowLongPress)
          : <View style={S.thumbPlaceholder} />}
      </View>
    ))
  }

  // ── Tab contents ───────────────────────────────────────────────────────────
  const renderBackgroundsTab = () => (
    <ScrollView style={S.content} contentContainerStyle={S.contentInner} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={S.importBtn} onPress={handleImportBg} activeOpacity={0.7}>
        <PlusIcon /><Text style={S.importBtnText}>从相册导入背景图</Text>
      </TouchableOpacity>
      <Text style={S.secLabel}>内置背景</Text>
      {renderGrid(BUILTIN, selBgId, b => setSelBgId(b.id === selBgId ? null : b.id), 'bg', false)}
      {bgs.length > 0 && <>
        <Text style={[S.secLabel, { marginTop: 16 }]}>已导入 · {bgs.length} 张</Text>
        {renderGrid(bgs, selBgId, b => setSelBgId(b.id === selBgId ? null : b.id), 'bg', true)}
      </>}
    </ScrollView>
  )

  const renderSpritesTab = () => (
    <ScrollView style={S.content} contentContainerStyle={S.contentInner} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={S.importBtn} onPress={handleImportSprite} activeOpacity={0.7}>
        <PlusIcon /><Text style={S.importBtnText}>从相册导入立绘</Text>
      </TouchableOpacity>
      {sprites.length === 0 && (
        <View style={S.emptyState}><Text style={S.emptyText}>暂无立绘，点击上方按钮导入</Text></View>
      )}
      {sprites.length > 0 && <>
        <Text style={S.secLabel}>已导入 · {sprites.length} 张</Text>
        {renderGrid(sprites, selSpriteId, s => setSelSpriteId(s.id === selSpriteId ? null : s.id), 'sprite', true)}
      </>}
    </ScrollView>
  )

  const renderCharactersTab = () => (
    <ScrollView style={S.content} contentContainerStyle={S.contentInner} showsVerticalScrollIndicator={false}>
      <View style={S.charList}>
        {chars.length === 0 && (
          <View style={S.emptyState}>
            <Text style={S.emptyText}>点击右上角「新建角色」添加角色</Text>
          </View>
        )}
        {chars.map((char, idx) => {
          const defSprite = sprites.find(s => s.id === char.defaultSpriteId)
          return (
            <View key={char.id}>
              <TouchableOpacity
                style={S.charItem}
                onLongPress={() => setActionTarget({ type: 'character', item: char })}
                delayLongPress={400}
                activeOpacity={0.8}
              >
                <View style={[S.charAvatar, defSprite && S.charAvatarFilled]}>
                  {defSprite
                    ? <Image source={{ uri: defSprite.uri }} style={S.charAvatarImg} />
                    : <PersonIcon />}
                </View>
                <View style={S.charInfo}>
                  <Text style={S.charName}>{char.name}</Text>
                  <Text style={S.charSub}>
                    {defSprite ? `默认立绘：${defSprite.name}` : '无默认立绘'}
                  </Text>
                </View>
                <View style={S.charHint}><Text style={S.thumbHintText}>长按操作</Text></View>
              </TouchableOpacity>
              {idx < chars.length - 1 && <View style={S.divider} />}
            </View>
          )
        })}
      </View>
    </ScrollView>
  )

  // ── Character edit modal ───────────────────────────────────────────────────
  const renderCharEdit = () => {
    const nameChanged = editCharName.trim() !== '' && editCharName.trim() !== editChar?.name
    return (
      <>
        {/* Frost decorative top line */}
        <LinearGradient
          colors={['rgba(210,235,248,0.18)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={S.modalTopLine}
        />

        {/* Title */}
        <Text style={S.modalTitle}>编辑角色</Text>

        {/* Name + ✓ */}
        <Text style={S.fieldLabel}>角色名称</Text>
        <View style={S.inputRow}>
          <TextInput
            style={[S.modalInput, { flex: 1, marginBottom: 0 }]}
            value={editCharName}
            onChangeText={setEditCharName}
            placeholder="输入角色名称"
            placeholderTextColor="rgba(210,235,248,0.25)"
            selectionColor="rgba(210,235,248,0.5)"
            returnKeyType="done"
            onSubmitEditing={handleConfirmCharName}
          />
          <TouchableOpacity
            style={[S.confirmBtn, !nameChanged && S.confirmBtnDisabled]}
            onPress={handleConfirmCharName}
            disabled={!nameChanged}
            activeOpacity={0.7}
          >
            <CheckIcon color={nameChanged ? 'rgba(210,235,248,0.9)' : 'rgba(210,235,248,0.2)'} />
          </TouchableOpacity>
        </View>

        {/* Default sprite — horizontal list */}
        <Text style={[S.fieldLabel, { marginTop: 16 }]}>默认立绘</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={S.spHScroll}
          contentContainerStyle={S.spHScrollContent}
        >
          {/* None */}
          <TouchableOpacity
            style={[S.spHItem, editChar?.defaultSpriteId === null && S.spHItemSelected]}
            onPress={() => handleSelectDefaultSprite(null)}
            activeOpacity={0.7}
          >
            <View style={[S.spHThumb, { alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(210,235,248,0.04)' }]}>
              <PersonIcon size={22} opacity={0.3} />
            </View>
            <Text style={S.spHName} numberOfLines={2}>不设置</Text>
            {editChar?.defaultSpriteId === null && (
              <View style={S.spHCheck}><CheckIcon size={9} /></View>
            )}
          </TouchableOpacity>
          {/* Sprites */}
          {sprites.map(sp => {
            const isCurr = editChar?.defaultSpriteId === sp.id
            return (
              <TouchableOpacity
                key={sp.id}
                style={[S.spHItem, isCurr && S.spHItemSelected]}
                onPress={() => handleSelectDefaultSprite(sp.id)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: sp.uri }} style={S.spHThumb} resizeMode="contain" />
                <Text style={S.spHName} numberOfLines={2}>{sp.name}</Text>
                {isCurr && <View style={S.spHCheck}><CheckIcon size={9} /></View>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {sprites.length === 0 && (
          <Text style={S.spHEmpty}>立绘库为空，请先在「立绘库」Tab 导入</Text>
        )}

        <View style={[S.divider, { marginVertical: 18 }]} />

        {/* Cancel */}
        <TouchableOpacity style={S.modalCancelLink} onPress={() => setEditChar(null)} activeOpacity={0.7}>
          <Text style={S.modalCancelLinkText}>取消</Text>
        </TouchableOpacity>
      </>
    )
  }

  // ── Action sheet (long-press) ──────────────────────────────────────────────
  const renderActionSheet = () => {
    if (!actionTarget) return null
    const isChar = actionTarget.type === 'character'
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <Pressable style={S.overlay} onPress={() => setActionTarget(null)}>
          <Pressable style={[S.modalBox, { paddingBottom: 8 }]} onPress={() => {}}>
            <Text style={S.actionTitle} numberOfLines={1}>{actionTarget.item.name}</Text>
            <View style={S.divider} />

            {/* Edit / Rename */}
            <TouchableOpacity
              style={S.actionItem}
              onPress={() => {
                if (isChar) {
                  setEditChar(actionTarget.item as CharRecord)
                } else {
                  setRenameText(actionTarget.item.name)
                  setRenameTarget(actionTarget as { type: 'bg' | 'sprite'; item: BgRecord | SpriteRecord })
                }
                setActionTarget(null)
              }}
              activeOpacity={0.7}
            >
              <PencilIcon />
              <Text style={S.actionItemText}>{isChar ? '编辑' : '重命名'}</Text>
            </TouchableOpacity>

            <View style={S.divider} />

            {/* Delete */}
            <TouchableOpacity
              style={S.actionItem}
              onPress={() => {
                const { type, item } = actionTarget
                setActionTarget(null)
                if (type === 'bg') handleDeleteBg(item as BgRecord)
                else if (type === 'sprite') handleDeleteSprite(item as SpriteRecord)
                else handleDeleteCharDirect(item as CharRecord)
              }}
              activeOpacity={0.7}
            >
              <TrashIcon />
              <Text style={[S.actionItemText, { color: 'rgba(210,110,110,0.8)' }]}>删除</Text>
            </TouchableOpacity>

            <View style={S.divider} />

            {/* Cancel */}
            <TouchableOpacity style={[S.actionItem, { justifyContent: 'center' }]}
              onPress={() => setActionTarget(null)} activeOpacity={0.7}>
              <Text style={[S.actionItemText, { color: 'rgba(210,235,248,0.3)' }]}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  // ── Rename modal ───────────────────────────────────────────────────────────
  const renderRenameModal = () => (
    <Modal visible={!!renameTarget} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={S.overlay} onPress={() => setRenameTarget(null)}>
        <Pressable style={S.modalBox} onPress={() => {}}>
          <LinearGradient
            colors={['rgba(210,235,248,0.18)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={S.modalTopLine}
          />
          <Text style={S.modalTitle}>重命名</Text>
          <View style={S.inputRow}>
            <TextInput
              style={[S.modalInput, { flex: 1 }]}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="输入备注名"
              placeholderTextColor="rgba(210,235,248,0.25)"
              selectionColor="rgba(210,235,248,0.5)"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <TouchableOpacity
              style={[S.confirmBtn, !renameText.trim() && S.confirmBtnDisabled]}
              onPress={handleRenameConfirm}
              disabled={!renameText.trim()}
              activeOpacity={0.7}
            >
              <CheckIcon color={renameText.trim() ? 'rgba(210,235,248,0.9)' : 'rgba(210,235,248,0.2)'} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={S.modalCancelLink} onPress={() => setRenameTarget(null)} activeOpacity={0.7}>
            <Text style={S.modalCancelLinkText}>取消</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )

  // ── Frost delete confirm modal ─────────────────────────────────────────────
  const renderDeleteModal = () => {
    if (!deleteModal) return null
    const isInfo = !deleteModal.onConfirm
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <Pressable style={S.overlay} onPress={() => setDeleteModal(null)}>
          <Pressable style={S.modalBox} onPress={() => {}}>
            {/* Frost decorative top line */}
            <LinearGradient
              colors={isInfo
                ? ['transparent', 'rgba(210,235,248,0.15)', 'transparent']
                : ['transparent', 'rgba(200,100,100,0.35)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 1, marginBottom: 22 }}
            />
            <Text style={[S.modalTitle, {
              color: isInfo ? 'rgba(210,235,248,0.7)' : 'rgba(215,155,145,0.9)',
              marginBottom: 10,
            }]}>
              {deleteModal.title}
            </Text>
            <Text style={S.deleteModalBody}>{deleteModal.body}</Text>
            <View style={[S.divider, { marginVertical: 20 }]} />
            <View style={S.btnRow}>
              <TouchableOpacity
                style={[S.btn, S.btnSecondary]}
                onPress={() => setDeleteModal(null)}
                activeOpacity={0.7}
              >
                <Text style={S.btnSecondaryText}>{isInfo ? '知道了' : '取消'}</Text>
              </TouchableOpacity>
              {!isInfo && (
                <TouchableOpacity
                  style={[S.btn, S.btnDanger]}
                  onPress={async () => { await deleteModal.onConfirm!(); setDeleteModal(null) }}
                  activeOpacity={0.7}
                >
                  <Text style={S.btnDangerText}>删除</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  const tabContent = { backgrounds: renderBackgroundsTab, sprites: renderSpritesTab, characters: renderCharactersTab }

  return (
    <View style={S.root}>
      <StatusBar translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#050608', '#060809', '#050607', '#040508']}
        locations={[0, 0.4, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {tabContent[activeTab]()}

      {/* Topbar */}
      <BlurView intensity={24} tint="dark" style={[S.topbar, { height: STATUS_H + TOPBAR_H }]}>
        <View style={[S.topbarInner, { paddingTop: STATUS_H }]}>
          <View style={S.topbarSide} />
          <Text style={S.topbarTitle}>资源库</Text>
          <View style={[S.topbarSide, { alignItems: 'flex-end' }]}>
            {activeTab === 'characters' && (
              <TouchableOpacity
                style={S.capsuleBtn}
                onPress={() => { setNewCharName(''); setNewCharVisible(true) }}
                activeOpacity={0.7}
              >
                <Text style={S.capsuleBtnText}>新建角色</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <LinearGradient
          colors={['transparent','rgba(210,235,248,0.08)','rgba(210,235,248,0.12)','rgba(210,235,248,0.08)','transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={S.topbarLine}
        />
      </BlurView>

      {/* Tab bar */}
      <View style={[S.tabBar, { top: STATUS_H + TOPBAR_H }]}>
        {(['backgrounds', 'sprites', 'characters'] as Tab[]).map(tab => {
          const active = activeTab === tab
          return (
            <TouchableOpacity key={tab} style={S.tabItem} onPress={() => setActiveTab(tab)} activeOpacity={0.8}>
              <View style={S.tabItemRow}>
                {active && <TabGem />}
                <Text style={[S.tabText, active && S.tabTextActive]}>{TAB_LABELS[tab]}</Text>
              </View>
              {active && (
                <LinearGradient
                  colors={['transparent','rgba(210,235,248,0.6)','transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={S.tabIndicator}
                />
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Bottom nav */}
      <BlurView intensity={24} tint="dark" style={S.bottomNav}>
        <View style={S.bottomNavBorder} />
        <TouchableOpacity style={S.navItem} activeOpacity={0.7} onPress={() => onBack?.()}>
          <HomeIcon active={false} /><Text style={S.navLabel}>作品</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.navItem} activeOpacity={0.7}>
          <GridIcon active /><Text style={[S.navLabel, S.navLabelActive]}>资源库</Text>
        </TouchableOpacity>
      </BlurView>

      {/* New character modal */}
      <Modal visible={newCharVisible} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={S.overlay} onPress={() => setNewCharVisible(false)}>
          <Pressable style={S.modalBox} onPress={() => {}}>
            <Text style={S.modalTitle}>新建角色</Text>
            <View style={S.inputRow}>
              <TextInput
                style={[S.modalInput, { flex: 1, marginBottom: 0 }]}
                placeholder="输入角色名称"
                placeholderTextColor="rgba(210,235,248,0.25)"
                value={newCharName}
                onChangeText={setNewCharName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateChar}
                selectionColor="rgba(210,235,248,0.5)"
              />
              <TouchableOpacity
                style={[S.confirmBtn, !newCharName.trim() && S.confirmBtnDisabled]}
                onPress={handleCreateChar}
                disabled={!newCharName.trim()}
                activeOpacity={0.7}
              >
                <CheckIcon color={newCharName.trim() ? 'rgba(210,235,248,0.9)' : 'rgba(210,235,248,0.2)'} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[S.btn, S.btnSecondary, { marginTop: 4 }]}
              onPress={() => setNewCharVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={S.btnSecondaryText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit character modal */}
      <Modal visible={!!editChar} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={S.overlay} onPress={() => setEditChar(null)}>
          <Pressable style={S.modalBox} onPress={() => {}}>
            {renderCharEdit()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Action sheet */}
      {renderActionSheet()}

      {/* Rename modal */}
      {renderRenameModal()}

      {/* Frost delete confirm / info modal */}
      {renderDeleteModal()}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050608' },

  // Topbar
  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.06)', overflow: 'hidden',
  },
  topbarInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22 },
  topbarSide: { flex: 1 },
  topbarTitle: { fontSize: 14, letterSpacing: 3, fontWeight: '600', color: 'rgba(235,242,248,0.9)' },
  topbarLine: { position: 'absolute', bottom: 0, left: 32, right: 32, height: 1 },
  capsuleBtn: {
    paddingVertical: 7, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.26)', borderRadius: 20,
  },
  capsuleBtnText: { fontSize: 10, letterSpacing: 1.8, color: 'rgba(210,235,248,0.85)' },

  // Tab bar
  tabBar: {
    position: 'absolute', left: 0, right: 0, height: TABS_H,
    flexDirection: 'row', backgroundColor: 'rgba(3,5,10,0.4)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(210,235,248,0.07)', zIndex: 9,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabItemRow: { flexDirection: 'row', alignItems: 'center' },
  tabText: { fontSize: 10, letterSpacing: 2, color: 'rgba(210,235,248,0.3)' },
  tabTextActive: { color: 'rgba(210,235,248,0.78)' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 1 },

  // Content
  content: { position: 'absolute', top: CONTENT_TOP, left: 0, right: 0, bottom: BOT_NAV_H },
  contentInner: { paddingTop: 16, paddingBottom: 32 },

  // Import button
  importBtn: {
    marginHorizontal: GRID_PAD, marginBottom: 20, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(210,235,248,0.04)',
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(210,235,248,0.16)',
    borderRadius: 6, gap: 10,
  },
  importBtnText: { fontSize: 10, letterSpacing: 2.5, color: 'rgba(210,235,248,0.38)' },

  // Section label
  secLabel: {
    marginHorizontal: GRID_PAD, marginBottom: 10,
    fontSize: 9, letterSpacing: 2.8, color: 'rgba(210,235,248,0.22)',
  },

  // Grid
  gridRow: { flexDirection: 'row', paddingHorizontal: GRID_PAD, gap: GRID_GAP, marginBottom: GRID_GAP },
  thumb: {
    width: THUMB_W, height: THUMB_H, borderRadius: 6,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(210,235,248,0.07)',
    backgroundColor: 'rgba(10,12,20,0.8)',
  },
  thumbSelected: { borderColor: 'rgba(210,235,248,0.28)', elevation: 4 },
  thumbPlaceholder: { width: THUMB_W, height: THUMB_H },
  thumbFill: { ...StyleSheet.absoluteFillObject },
  thumbLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 8, paddingTop: 14, paddingHorizontal: 10,
  },
  thumbLabelText: { fontSize: 9, letterSpacing: 1.8, color: 'rgba(210,235,248,0.55)' },
  thumbHint: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(3,5,10,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  thumbHintText: { fontSize: 7, letterSpacing: 1, color: 'rgba(210,235,248,0.28)' },

  // Divider
  divider: { height: 1, backgroundColor: 'rgba(210,235,248,0.06)' },

  // Character list
  charList: { paddingHorizontal: GRID_PAD },
  charItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  charAvatar: {
    width: 52, height: 52, borderRadius: 8,
    backgroundColor: 'rgba(210,235,248,0.04)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  charAvatarFilled: { borderColor: 'rgba(210,235,248,0.2)' },
  charAvatarImg: { width: '100%', height: '100%', resizeMode: 'contain' },
  charInfo: { flex: 1 },
  charName: { fontSize: 13, letterSpacing: 1.6, fontWeight: '600', color: 'rgba(235,242,248,0.85)' },
  charSub: { fontSize: 9, letterSpacing: 1.8, color: 'rgba(210,235,248,0.3)', marginTop: 3 },
  charHint: {
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.07)', borderRadius: 3,
    backgroundColor: 'rgba(210,235,248,0.03)',
  },

  // Empty state
  emptyState: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontSize: 10, letterSpacing: 2, color: 'rgba(210,235,248,0.22)' },

  // Bottom nav
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: BOT_NAV_H,
    flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12, overflow: 'hidden',
  },
  bottomNavBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(210,235,248,0.06)' },
  navItem: { flex: 1, alignItems: 'center', gap: 4 },
  navLabel: { fontSize: 9, letterSpacing: 2, color: 'rgba(210,235,248,0.3)' },
  navLabelActive: { color: 'rgba(210,235,248,0.7)' },

  // Modal base
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  modalBox: {
    width: SCREEN_W - 64,
    backgroundColor: 'rgba(4,7,14,0.97)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    borderRadius: 12, overflow: 'hidden', padding: 24,
  },
  modalTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalTitle: {
    fontSize: 13, letterSpacing: 2, fontWeight: '600',
    color: 'rgba(235,242,248,0.9)', textAlign: 'center', marginBottom: 16,
  },
  modalTitleCenter: { flex: 1, marginBottom: 0 },
  modalCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
    backgroundColor: 'rgba(210,235,248,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 11, color: 'rgba(210,235,248,0.45)' },
  modalInput: {
    paddingVertical: 9, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.15)', borderRadius: 6,
    fontSize: 13, letterSpacing: 1,
    color: 'rgba(235,242,248,0.9)', backgroundColor: 'rgba(210,235,248,0.04)',
  },
  fieldLabel: { fontSize: 9, letterSpacing: 2.2, color: 'rgba(210,235,248,0.35)', marginBottom: 8 },

  // Input row (input + ✓ side by side)
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  confirmBtn: {
    width: 44, height: 36, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.18)',
    backgroundColor: 'rgba(210,235,248,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelLink: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  modalCancelLinkText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.3)' },
  confirmBtnDisabled: {
    borderColor: 'rgba(210,235,248,0.07)',
    backgroundColor: 'rgba(210,235,248,0.02)',
  },

  // Horizontal sprite picker (in char edit)
  spHScroll: { marginBottom: 4 },
  spHScrollContent: { flexDirection: 'row', gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  spHItem: {
    width: 68, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.08)', borderRadius: 8,
    paddingTop: 8, paddingBottom: 8,
    backgroundColor: 'rgba(210,235,248,0.03)',
  },
  spHItemSelected: { borderColor: 'rgba(210,235,248,0.28)', backgroundColor: 'rgba(210,235,248,0.07)' },
  spHThumb: {
    width: 52, height: 52, borderRadius: 6, overflow: 'hidden',
    backgroundColor: 'rgba(10,12,20,0.6)',
  },
  spHName: {
    fontSize: 9, letterSpacing: 1, color: 'rgba(210,235,248,0.45)',
    textAlign: 'center', marginTop: 6, paddingHorizontal: 4, lineHeight: 13,
  },
  spHCheck: {
    position: 'absolute', top: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(3,5,10,0.7)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  spHEmpty: {
    fontSize: 9, letterSpacing: 1.8, color: 'rgba(210,235,248,0.22)',
    textAlign: 'center', marginTop: 8,
  },

  // Action sheet
  actionTitle: {
    fontSize: 11, letterSpacing: 2, color: 'rgba(210,235,248,0.4)',
    textAlign: 'center', marginBottom: 14,
  },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  actionItemText: { fontSize: 13, letterSpacing: 1.5, color: 'rgba(210,235,248,0.75)' },

  // Delete confirm modal
  deleteModalBody: {
    fontSize: 11, letterSpacing: 1.5, lineHeight: 18,
    color: 'rgba(210,235,248,0.45)', textAlign: 'center',
  },

  // Delete button (in char edit modal)
  deleteBtn: {
    height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(210,130,130,0.2)',
    backgroundColor: 'rgba(210,100,100,0.06)',
  },
  deleteBtnText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,155,150,0.7)' },

  // Shared button row
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  btnSecondary: {
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
    backgroundColor: 'rgba(210,235,248,0.04)',
  },
  btnSecondaryText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.5)' },
  btnDanger: {
    borderWidth: 1, borderColor: 'rgba(210,100,100,0.3)',
    backgroundColor: 'rgba(200,80,80,0.1)',
  },
  btnDangerText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(215,150,140,0.9)' },
})
