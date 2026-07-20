import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  StyleSheet, StatusBar, TextInput, Modal, Dimensions, BackHandler,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  Chapter,
  loadProjects,
  createChapter,
  renameChapter,
  deleteChapter,
  moveChapter,
} from '../hooks/useFrameResolver'
import FrameEditorScreen from './FrameEditorScreen'
import PlayerScreen from './PlayerScreen'

const STATUS_H  = StatusBar.currentHeight ?? 24
const TOPBAR_H  = 72
const BOT_H     = 44   // "轻触返回" area height
const { width: SCREEN_W } = Dimensions.get('screen')

const KEY_RECENT = 'recent_read_v1'

async function loadRecentChapter(projectId: string): Promise<string | null> {
  try {
    const r = await AsyncStorage.getItem(KEY_RECENT)
    const map = r ? JSON.parse(r) : {}
    return map[projectId] ?? null
  } catch { return null }
}

async function saveRecentChapter(projectId: string, chapterId: string): Promise<void> {
  try {
    const r = await AsyncStorage.getItem(KEY_RECENT)
    const map = r ? JSON.parse(r) : {}
    map[projectId] = chapterId
    await AsyncStorage.setItem(KEY_RECENT, JSON.stringify(map))
  } catch {}
}

function estimatedMinutes(frameCount: number): string {
  if (frameCount === 0) return '0 帧'
  const mins = Math.max(1, Math.round(frameCount * 4 / 60))
  return `${frameCount} 帧 · 约 ${mins} 分钟`
}

// ── Action sheet icons ────────────────────────────────────────────────────────

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

function ChevronUpIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
      <Path d="M3 9.5l4-4 4 4" stroke="rgba(210,235,248,0.5)" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChevronDownIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
      <Path d="M3 4.5l4 4 4-4" stroke="rgba(210,235,248,0.5)" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// ── Back circle button ────────────────────────────────────────────────────────

function BackCircle({ onPress, style }: { onPress: () => void; style?: object }) {
  return (
    <TouchableOpacity
      style={[S.backCircle, style]}
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
    >
      <Svg width={13} height={13} viewBox="0 0 13 13" fill="none">
        <Path
          d="M8.5 11L4 6.5 8.5 2"
          stroke="rgba(210,235,248,0.55)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  projectName: string
  mode: 'edit' | 'play'
  onBack: () => void
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ChapterListScreen({ projectId, projectName, mode, onBack }: Props) {
  const [chapters, setChapters]   = useState<Chapter[]>([])
  const [recentId, setRecentId]   = useState<string | null>(null)

  // Sub-screen navigation
  const [editChapter,   setEditChapter]   = useState<Chapter | null>(null)
  const [playChapter,   setPlayChapter]   = useState<Chapter | null>(null)

  // Chapter CRUD modals
  const [newVisible,  setNewVisible]  = useState(false)
  const [newName,     setNewName]     = useState('')

  const [actionTarget, setActionTarget] = useState<Chapter | null>(null)

  const [renameTarget, setRenameTarget] = useState<Chapter | null>(null)
  const [renameText,   setRenameText]   = useState('')

  const [confirmModal, setConfirmModal] = useState<{
    title: string; body: string; onConfirm?: () => Promise<void>
  } | null>(null)

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 子屏幕（FrameEditorScreen / PlayerScreen）已接管时，让它们自行处理
      if (editChapter || playChapter) return false
      onBackRef.current()
      return true
    })
    return () => sub.remove()
  }, [editChapter, playChapter])

  const reload = useCallback(async () => {
    const projects = await loadProjects()
    const proj = projects.find(p => p.id === projectId)
    setChapters(proj?.chapters ?? [])
    const recent = await loadRecentChapter(projectId)
    setRecentId(recent)
  }, [projectId])

  useEffect(() => { reload() }, [reload])

  const handleCreateChapter = async () => {
    if (!newName.trim()) return
    await createChapter(projectId, newName.trim())
    setNewName('')
    setNewVisible(false)
    await reload()
  }

  const handleRenameConfirm = async () => {
    if (!renameTarget || !renameText.trim()) return
    await renameChapter(projectId, renameTarget.id, renameText.trim())
    setRenameTarget(null)
    setRenameText('')
    await reload()
  }

  const handleDeleteRequest = (ch: Chapter) => {
    setActionTarget(null)
    if (chapters.length <= 1) {
      setConfirmModal({ title: '无法删除', body: '至少保留一个章节。' })
      return
    }
    setConfirmModal({
      title: '删除章节',
      body: `确定删除「${ch.name}」？所有帧数据将一并删除，无法撤销。`,
      onConfirm: async () => {
        await deleteChapter(projectId, ch.id)
        setConfirmModal(null)
        await reload()
      },
    })
  }

  const handleMove = async (ch: Chapter, dir: 'up' | 'down') => {
    setActionTarget(null)
    await moveChapter(projectId, ch.id, dir)
    await reload()
  }

  const handlePlayChapter = async (ch: Chapter) => {
    await saveRecentChapter(projectId, ch.id)
    setRecentId(ch.id)
    setPlayChapter(ch)
  }

  // ── Render: FrameEditorScreen overlay (edit mode) ──
  if (editChapter) {
    return (
      <FrameEditorScreen
        chapterId={editChapter.id}
        chapterName={editChapter.name}
        onBack={async () => {
          setEditChapter(null)
          await reload()
        }}
      />
    )
  }

  // ── Render: PlayerScreen overlay (play mode) ──
  if (playChapter) {
    return (
      <PlayerScreen
        frames={playChapter.frames}
        startIndex={0}
        onExit={() => setPlayChapter(null)}
      />
    )
  }

  // ── Render: Edit mode ──────────────────────────────────────────────────────
  if (mode === 'edit') {
    return (
      <View style={S.root}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <LinearGradient
          colors={['#050608', '#060809', '#050607', '#040508']}
          locations={[0, 0.4, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Topbar — 用 View 代替 BlurView，规避坑 7 Android native crash */}
        <View style={[S.topbar, { backgroundColor: 'rgba(3,5,10,0.88)' }]}>
          <View style={S.topbarInner}>
            <View style={S.topbarLeft}>
              <BackCircle onPress={onBack} />
              <View style={S.topbarTitles}>
                <Text style={S.topbarTitle} numberOfLines={1}>{projectName}</Text>
                <Text style={S.topbarSub}>编辑模式</Text>
              </View>
            </View>
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(210,235,248,0.08)', 'rgba(210,235,248,0.12)', 'rgba(210,235,248,0.08)', 'transparent']}
            locations={[0, 0.3, 0.5, 0.7, 1]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={S.topbarLine}
          />
        </View>

        {/* Chapter list */}
        <ScrollView
          style={S.editList}
          contentContainerStyle={S.editListContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={S.sectionLabel}>
            章节列表 · {chapters.length} 章
          </Text>

          {chapters.map((ch, idx) => (
            <TouchableOpacity
              key={ch.id}
              style={S.chapCard}
              activeOpacity={0.7}
              onPress={() => setEditChapter(ch)}
              onLongPress={() => setActionTarget(ch)}
              delayLongPress={400}
            >
              <LinearGradient
                colors={['transparent', 'rgba(210,235,248,0.14)', 'transparent']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.chapCardTopLine}
              />
              <View style={S.chapCardLeft}>
                <View style={S.chapNum}>
                  <Text style={S.chapNumText}>{String(idx + 1).padStart(2, '0')}</Text>
                </View>
                <View style={S.chapInfo}>
                  <Text style={S.chapName}>{ch.name}</Text>
                  <Text style={S.chapFrames}>{ch.frames.length} 帧</Text>
                </View>
              </View>
              <Text style={S.chapArrow}>›</Text>
            </TouchableOpacity>
          ))}

          {/* New chapter button */}
          <TouchableOpacity
            style={S.newChapBtn}
            activeOpacity={0.7}
            onPress={() => { setNewName(''); setNewVisible(true) }}
          >
            <View style={S.plusIcon}>
              <View style={S.plusH} />
              <View style={S.plusV} />
            </View>
            <Text style={S.newChapText}>新建章节</Text>
          </TouchableOpacity>
        </ScrollView>

        {renderModals()}
      </View>
    )
  }

  // ── Render: Play mode ──────────────────────────────────────────────────────
  return (
    <View style={S.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <LinearGradient
        colors={['#030407', '#050608', '#030407']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back button top-left */}
      <BackCircle onPress={onBack} style={S.playBackBtn} />

      {/* Title area (top 180px) */}
      <LinearGradient
        colors={['rgba(2,4,8,0.7)', 'transparent']}
        style={S.playTitleArea}
      >
        <View style={S.playTitleRow}>
          <LinearGradient
            colors={['transparent', 'rgba(210,235,248,0.3)']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={{ width: 28, height: 1 }}
          />
          <View style={S.playTitleGem} />
          <LinearGradient
            colors={['rgba(210,235,248,0.3)', 'transparent']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={{ width: 28, height: 1 }}
          />
        </View>
        <Text style={S.playTitle}>{projectName}</Text>
        <Text style={S.playSubtitle}>选择章节开始阅读</Text>
      </LinearGradient>

      {/* Chapter list */}
      <ScrollView
        style={S.playList}
        contentContainerStyle={S.playListContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={S.sectionLabelPlay}>共 {chapters.length} 章</Text>

        {chapters.map((ch, idx) => {
          const isRecent = ch.id === recentId
          return (
            <TouchableOpacity
              key={ch.id}
              style={[S.chapCard, S.chapCardPlay, isRecent && S.chapCardHighlight]}
              activeOpacity={0.7}
              onPress={() => handlePlayChapter(ch)}
            >
              <LinearGradient
                colors={['transparent', 'rgba(210,235,248,0.14)', 'transparent']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.chapCardTopLine}
              />
              <View style={S.chapCardLeft}>
                <View style={[S.chapNum, isRecent && S.chapNumHighlight]}>
                  <Text style={[S.chapNumText, isRecent && S.chapNumTextHighlight]}>
                    {String(idx + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={S.chapInfo}>
                  <View style={S.chapNameRow}>
                    <Text style={[S.chapName, { color: isRecent ? 'rgba(235,242,248,0.9)' : 'rgba(235,242,248,0.82)' }]}>
                      {ch.name}
                    </Text>
                    {isRecent && (
                      <View style={S.recentBadge}>
                        <Text style={S.recentBadgeText}>最近阅读</Text>
                      </View>
                    )}
                  </View>
                  <Text style={S.chapFrames}>{estimatedMinutes(ch.frames.length)}</Text>
                </View>
              </View>
              <View style={[S.playGem, !isRecent && { opacity: 0.5 }]} />
            </TouchableOpacity>
          )
        })}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Bottom "轻触返回" area */}
      <TouchableOpacity
        style={S.playBottomReturn}
        activeOpacity={0.7}
        onPress={onBack}
      >
        <View style={S.playBottomLine} />
        <Text style={S.playBottomText}>轻触返回</Text>
      </TouchableOpacity>
    </View>
  )

  // ── Modals (shared for edit mode) ─────────────────────────────────────────
  function renderModals() {
    return (
      <>
        {/* New chapter */}
        <Modal visible={newVisible} transparent animationType="fade" onRequestClose={() => setNewVisible(false)}>
          <Pressable style={S.modalOverlay} onPress={() => setNewVisible(false)}>
            <Pressable style={S.modalBox} onPress={() => {}}>
              <LinearGradient
                colors={['rgba(210,235,248,0.18)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.modalTopLine}
              />
              <Text style={S.modalTitle}>新建章节</Text>
              <View style={S.modalInputRow}>
                <TextInput
                  style={S.modalInput}
                  placeholder="章节名称"
                  placeholderTextColor="rgba(210,235,248,0.22)"
                  selectionColor="rgba(210,235,248,0.5)"
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateChapter}
                />
                <TouchableOpacity
                  style={[S.confirmBtn, newName.trim() ? S.confirmBtnActive : S.confirmBtnDisabled]}
                  onPress={handleCreateChapter}
                  disabled={!newName.trim()}
                >
                  <Text style={S.confirmBtnText}>✓</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={S.modalCancel} onPress={() => setNewVisible(false)}>
                <Text style={S.modalCancelText}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Action popup */}
        <Modal visible={!!actionTarget} transparent animationType="fade" onRequestClose={() => setActionTarget(null)}>
          <Pressable style={S.modalOverlay} onPress={() => setActionTarget(null)}>
            <Pressable style={S.actionBox} onPress={() => {}}>
              {actionTarget && <Text style={S.actionTitle} numberOfLines={1}>{actionTarget.name}</Text>}
              <View style={S.actionDivider} />
              <TouchableOpacity style={S.actionItem} onPress={() => {
                const t = actionTarget!
                setActionTarget(null)
                setRenameText(t.name)
                setRenameTarget(t)
              }} activeOpacity={0.7}>
                <PencilIcon />
                <Text style={S.actionItemText}>重命名</Text>
              </TouchableOpacity>
              <View style={S.actionDivider} />
              <TouchableOpacity style={S.actionItem} onPress={() => handleMove(actionTarget!, 'up')} activeOpacity={0.7}>
                <ChevronUpIcon />
                <Text style={S.actionItemText}>上移</Text>
              </TouchableOpacity>
              <View style={S.actionDivider} />
              <TouchableOpacity style={S.actionItem} onPress={() => handleMove(actionTarget!, 'down')} activeOpacity={0.7}>
                <ChevronDownIcon />
                <Text style={S.actionItemText}>下移</Text>
              </TouchableOpacity>
              <View style={S.actionDivider} />
              <TouchableOpacity style={S.actionItem} onPress={() => handleDeleteRequest(actionTarget!)} activeOpacity={0.7}>
                <TrashIcon />
                <Text style={[S.actionItemText, S.actionItemDanger]}>删除章节</Text>
              </TouchableOpacity>
              <View style={S.actionDivider} />
              <TouchableOpacity style={[S.actionItem, { justifyContent: 'center' }]} onPress={() => setActionTarget(null)} activeOpacity={0.7}>
                <Text style={[S.actionItemText, { color: 'rgba(210,235,248,0.3)' }]}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Rename */}
        <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
          <Pressable style={S.modalOverlay} onPress={() => setRenameTarget(null)}>
            <Pressable style={S.modalBox} onPress={() => {}}>
              <LinearGradient
                colors={['rgba(210,235,248,0.18)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.modalTopLine}
              />
              <Text style={S.modalTitle}>重命名章节</Text>
              <View style={S.modalInputRow}>
                <TextInput
                  style={S.modalInput}
                  selectionColor="rgba(210,235,248,0.5)"
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleRenameConfirm}
                />
                <TouchableOpacity
                  style={[S.confirmBtn, renameText.trim() ? S.confirmBtnActive : S.confirmBtnDisabled]}
                  onPress={handleRenameConfirm}
                  disabled={!renameText.trim()}
                >
                  <Text style={S.confirmBtnText}>✓</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={S.modalCancel} onPress={() => setRenameTarget(null)}>
                <Text style={S.modalCancelText}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Confirm/Delete */}
        <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
          <Pressable style={S.modalOverlay} onPress={() => {}}>
            <Pressable style={S.modalBox} onPress={() => {}}>
              <LinearGradient
                colors={confirmModal?.onConfirm
                  ? ['transparent', 'rgba(200,100,100,0.35)', 'transparent']
                  : ['transparent', 'rgba(210,235,248,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 1, marginBottom: 22 }}
              />
              <Text style={[S.modalTitle, {
                color: confirmModal?.onConfirm ? 'rgba(215,155,145,0.9)' : 'rgba(210,235,248,0.7)',
                marginBottom: 10,
              }]}>
                {confirmModal?.title}
              </Text>
              <Text style={S.deleteModalBody}>{confirmModal?.body}</Text>
              <View style={S.deleteDivider} />
              <View style={S.modalBtnRow}>
                <TouchableOpacity style={S.modalBtnCancel} onPress={() => setConfirmModal(null)}>
                  <Text style={S.modalBtnCancelText}>{confirmModal?.onConfirm ? '取消' : '知道了'}</Text>
                </TouchableOpacity>
                {confirmModal?.onConfirm && (
                  <TouchableOpacity style={S.modalBtnDelete} onPress={() => confirmModal.onConfirm?.()}>
                    <Text style={S.modalBtnDeleteText}>删除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    )
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04060c' },

  // Topbar
  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: STATUS_H + TOPBAR_H,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  topbarInner: {
    height: TOPBAR_H,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 22,
  },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topbarTitles: { flexDirection: 'column' },
  topbarTitle: {
    fontSize: 14, letterSpacing: 2, fontWeight: '600',
    color: 'rgba(235,242,248,0.9)',
    maxWidth: SCREEN_W - 120,
  },
  topbarSub: { fontSize: 9, letterSpacing: 2, color: 'rgba(210,235,248,0.32)', marginTop: 3 },
  topbarLine: { position: 'absolute', bottom: 0, left: 32, right: 32, height: 1 },

  // Back circle
  backCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(3,5,10,0.38)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Edit mode list
  editList: {
    position: 'absolute',
    top: STATUS_H + TOPBAR_H,
    left: 0, right: 0, bottom: 0,
  },
  editListContent: { paddingTop: 20, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 9, letterSpacing: 3.2,
    color: 'rgba(210,235,248,0.22)',
    paddingHorizontal: 24, paddingBottom: 10,
  },

  // Chapter card
  chapCard: {
    marginHorizontal: 24, marginBottom: 8,
    backgroundColor: 'rgba(3,6,14,0.5)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.07)',
    borderRadius: 7,
    padding: 14, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center',
    position: 'relative', overflow: 'hidden',
  },
  chapCardPlay: { marginBottom: 10 },
  chapCardHighlight: {
    borderColor: 'rgba(210,235,248,0.28)',
    backgroundColor: 'rgba(3,5,10,0.55)',
    shadowColor: 'rgba(180,220,245,0.07)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  chapCardTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  chapCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chapNum: {
    width: 28, height: 28,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.14)',
    borderRadius: 3,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  chapNumHighlight: { borderColor: 'rgba(210,235,248,0.3)' },
  chapNumText: { fontSize: 11, letterSpacing: 0.8, color: 'rgba(210,235,248,0.4)' },
  chapNumTextHighlight: { color: 'rgba(210,235,248,0.7)' },
  chapInfo: { flex: 1 },
  chapNameRow: { flexDirection: 'row', alignItems: 'center' },
  chapName: { fontSize: 13, letterSpacing: 1.2, color: 'rgba(235,242,248,0.82)' },
  chapFrames: { fontSize: 9, letterSpacing: 1.8, color: 'rgba(210,235,248,0.28)', marginTop: 2 },
  chapArrow: { fontSize: 10, color: 'rgba(210,235,248,0.22)' },

  // Recent badge
  recentBadge: {
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.15)',
    borderRadius: 2, paddingVertical: 2, paddingHorizontal: 6,
    marginLeft: 8,
  },
  recentBadgeText: { fontSize: 8, letterSpacing: 2, color: 'rgba(210,235,248,0.45)' },

  // New chapter button
  newChapBtn: {
    marginHorizontal: 24, marginBottom: 12, marginTop: 4,
    height: 46,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)', borderStyle: 'solid',
    borderRadius: 5,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, gap: 10,
  },
  newChapText: { fontSize: 11, letterSpacing: 2, color: 'rgba(210,235,248,0.28)' },
  plusIcon: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  plusH: { position: 'absolute', width: 10, height: 1, backgroundColor: 'rgba(210,235,248,0.25)', borderRadius: 1 },
  plusV: { position: 'absolute', width: 1, height: 10, backgroundColor: 'rgba(210,235,248,0.25)', borderRadius: 1 },

  // Play mode
  playBackBtn: {
    position: 'absolute',
    top: STATUS_H + 18,
    left: 22,
    zIndex: 20,
  },

  playTitleArea: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 180,
    alignItems: 'center', justifyContent: 'center',
    gap: 10,
    paddingTop: STATUS_H + 44,
  },
  playTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playTitleGem: { width: 7, height: 7, backgroundColor: 'rgba(210,235,248,0.65)', transform: [{ rotate: '45deg' }] },
  playTitle: {
    fontSize: 16, letterSpacing: 2.8, fontWeight: '600',
    color: 'rgba(235,242,248,0.85)',
  },
  playSubtitle: { fontSize: 9, letterSpacing: 3.2, color: 'rgba(210,235,248,0.28)' },

  playList: { position: 'absolute', top: 200, bottom: BOT_H + 28, left: 0, right: 0 },
  playListContent: { paddingBottom: 24 },

  sectionLabelPlay: {
    fontSize: 9, letterSpacing: 3.2,
    color: 'rgba(210,235,248,0.22)',
    paddingHorizontal: 24, paddingBottom: 14,
  },

  playGem: { width: 5, height: 5, backgroundColor: 'rgba(210,235,248,0.8)', transform: [{ rotate: '45deg' }] },

  // Bottom return area
  playBottomReturn: {
    position: 'absolute', bottom: 28, left: 0, right: 0,
    alignItems: 'center', gap: 6,
  },
  playBottomLine: {
    width: 44, height: 1,
    backgroundColor: 'rgba(210,235,248,0.32)',
  },
  playBottomText: {
    fontSize: 8, letterSpacing: 3.6,
    color: 'rgba(210,235,248,0.22)',
  },

  // Modals (same as HomeScreen)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalBox: {
    width: SCREEN_W - 64,
    backgroundColor: 'rgba(3,5,12,0.96)',
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    padding: 24,
  },
  modalTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  modalTitle: { fontSize: 13, letterSpacing: 2, color: 'rgba(235,242,248,0.9)', marginBottom: 16, fontWeight: '600', textAlign: 'center' },
  deleteModalBody: { fontSize: 11, letterSpacing: 1.5, lineHeight: 18, color: 'rgba(210,235,248,0.45)', textAlign: 'center' },
  deleteDivider: { height: 1, backgroundColor: 'rgba(210,235,248,0.06)', marginVertical: 20 },
  modalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  modalInput: {
    flex: 1,
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: 'rgba(210,235,248,0.05)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
    borderRadius: 5,
    fontSize: 13, color: 'rgba(235,242,248,0.9)', letterSpacing: 1,
  },
  confirmBtn: { width: 44, height: 36, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  confirmBtnActive: { borderWidth: 1, borderColor: 'rgba(210,235,248,0.4)', backgroundColor: 'rgba(210,235,248,0.08)' },
  confirmBtnDisabled: { borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)', backgroundColor: 'transparent' },
  confirmBtnText: { fontSize: 14, color: 'rgba(210,235,248,0.85)' },
  modalCancel: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  modalCancelText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.3)' },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: {
    flex: 1, height: 40, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
    backgroundColor: 'rgba(210,235,248,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnCancelText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(210,235,248,0.5)' },
  modalBtnDelete: {
    flex: 1, height: 40, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(210,100,100,0.3)',
    backgroundColor: 'rgba(200,80,80,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnDeleteText: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(215,150,140,0.9)' },

  // Action popup (长按章节)
  actionBox: {
    width: SCREEN_W - 64,
    backgroundColor: 'rgba(4,7,14,0.97)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    borderRadius: 12, padding: 20, paddingBottom: 8,
  },
  actionTitle: {
    fontSize: 11, letterSpacing: 2, color: 'rgba(210,235,248,0.4)',
    textAlign: 'center', marginBottom: 14,
  },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  actionItemText: { fontSize: 13, letterSpacing: 1.5, color: 'rgba(210,235,248,0.75)' },
  actionItemDanger: { color: 'rgba(210,110,110,0.8)' },
  actionDivider: { height: 1, backgroundColor: 'rgba(210,235,248,0.06)' },
})
