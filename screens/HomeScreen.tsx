import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  StyleSheet, StatusBar, TextInput, Modal, Dimensions,
} from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Project,
  loadProjects,
  createProject,
  renameProject,
  deleteProject,
} from '../hooks/useFrameResolver'

const STATUS_H  = StatusBar.currentHeight ?? 24
const BOT_NAV_H = 96
const BRAND_H   = 110
const { width: SCREEN_W } = Dimensions.get('screen')

interface Props {
  onChapterEdit: (projectId: string, projectName: string) => void
  onChapterPlay: (projectId: string, projectName: string) => void
  onLibrary: () => void
}

// ── SVG Icon helpers ──────────────────────────────────────────────────────────

function DiamondRow() {
  return (
    <View style={S.brandRow}>
      <LinearGradient
        colors={['transparent', 'rgba(210,235,248,0.3)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ width: 32, height: 1 }}
      />
      <View style={S.gem} />
      <View style={[S.gem, { opacity: 0.5, marginHorizontal: 2 }]} />
      <View style={S.gem} />
      <LinearGradient
        colors={['rgba(210,235,248,0.3)', 'transparent']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ width: 32, height: 1 }}
      />
    </View>
  )
}

function HomeNavIcon({ active }: { active: boolean }) {
  const c = active ? 'rgba(210,235,248,0.8)' : 'rgba(210,235,248,0.28)'
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path d="M3 10.5L10 3l7 7.5V18H13v-5H7v5H3V10.5z" stroke={c} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  )
}

function GridNavIcon({ active }: { active: boolean }) {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function metaText(proj: Project): string {
  const nChap = proj.chapters.length
  if (nChap === 0) return '0 章节 · 刚刚创建'
  const nFrames = proj.chapters.reduce((sum, ch) => sum + ch.frames.length, 0)
  return `${nChap} 章节 · ${nFrames} 帧`
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen({ onChapterEdit, onChapterPlay, onLibrary }: Props) {
  const [projects, setProjects] = useState<Project[]>([])

  // New project modal
  const [newVisible, setNewVisible]   = useState(false)
  const [newName,    setNewName]      = useState('')

  // Action sheet (··· menu)
  const [actionTarget, setActionTarget] = useState<Project | null>(null)

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [renameText,   setRenameText]   = useState('')

  // Frost confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string; body: string; onConfirm?: () => Promise<void>
  } | null>(null)

  const refresh = useCallback(async () => {
    setProjects(await loadProjects())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createProject(newName.trim())
    setNewName('')
    setNewVisible(false)
    await refresh()
  }

  const handleRenameConfirm = async () => {
    if (!renameTarget || !renameText.trim()) return
    await renameProject(renameTarget.id, renameText.trim())
    setRenameTarget(null)
    setRenameText('')
    await refresh()
  }

  const handleDeleteRequest = (proj: Project) => {
    setActionTarget(null)
    setConfirmModal({
      title: '删除作品',
      body: `确定删除「${proj.name}」？所有章节与帧数据将一并删除，无法撤销。`,
      onConfirm: async () => {
        await deleteProject(proj.id)
        setConfirmModal(null)
        await refresh()
      },
    })
  }

  const hasContent = (proj: Project) => proj.chapters.length > 0

  return (
    <View style={S.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Background gradient */}
      <LinearGradient
        colors={['#050608', '#060809', '#050607', '#040508']}
        locations={[0, 0.4, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Brand area */}
      <View style={S.brandArea}>
        <DiamondRow />
        <Text style={S.brandSub}>我的作品</Text>
      </View>

      {/* Project list */}
      <ScrollView
        style={S.list}
        contentContainerStyle={S.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* New project button */}
        <TouchableOpacity
          style={S.newProjBtn}
          activeOpacity={0.7}
          onPress={() => { setNewName(''); setNewVisible(true) }}
        >
          <View style={S.plusIcon}>
            <View style={S.plusH} />
            <View style={S.plusV} />
          </View>
          <Text style={S.newProjText}>新建作品</Text>
        </TouchableOpacity>

        {projects.map(proj => (
          <View key={proj.id} style={S.card}>
            {/* top highlight line */}
            <LinearGradient
              colors={['transparent', 'rgba(210,235,248,0.22)', 'rgba(210,235,248,0.18)', 'transparent']}
              locations={[0, 0.3, 0.7, 1]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.cardTopLine}
            />
            <View style={S.cardInner}>
              <View style={S.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={S.cardName}>{proj.name}</Text>
                  <Text style={S.cardMeta}>{metaText(proj)}</Text>
                </View>
                <TouchableOpacity
                  style={S.moreBtn}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  onPress={() => setActionTarget(proj)}
                >
                  <Text style={S.moreBtnText}>···</Text>
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <LinearGradient
                colors={['transparent', 'rgba(210,235,248,0.12)', 'rgba(210,235,248,0.18)', 'rgba(210,235,248,0.12)', 'transparent']}
                locations={[0, 0.2, 0.5, 0.8, 1]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.divider}
              />

              <View style={S.cardActions}>
                <TouchableOpacity
                  style={[S.cardBtn, S.cardBtnEdit]}
                  activeOpacity={0.7}
                  onPress={() => onChapterEdit(proj.id, proj.name)}
                >
                  <PencilIcon />
                  <Text style={S.cardBtnEditText}>编　辑</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[S.cardBtn, S.cardBtnPlay, !hasContent(proj) && S.cardBtnPlayDisabled]}
                  activeOpacity={hasContent(proj) ? 0.7 : 1}
                  onPress={() => hasContent(proj) && onChapterPlay(proj.id, proj.name)}
                >
                  <View style={[S.gemSmall, !hasContent(proj) && { opacity: 0.4 }]} />
                  <Text style={[S.cardBtnPlayText, !hasContent(proj) && { opacity: 0.4 }]}>播　放</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Bottom nav — View 代替 BlurView，规避坑 7 */}
      <View style={[S.bottomNav, { backgroundColor: 'rgba(2,4,8,0.85)' }]}>
        <View style={S.bottomNavBorder} />
        <View style={S.navItem}>
          <HomeNavIcon active />
          <Text style={[S.navLabel, S.navLabelActive]}>作品</Text>
        </View>
        <TouchableOpacity style={S.navItem} activeOpacity={0.7} onPress={onLibrary}>
          <GridNavIcon active={false} />
          <Text style={S.navLabel}>资源库</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal: New Project ── */}
      <Modal visible={newVisible} transparent animationType="fade" onRequestClose={() => setNewVisible(false)}>
        <Pressable style={S.modalOverlay} onPress={() => setNewVisible(false)}>
          <Pressable style={S.modalBox} onPress={() => {}}>
            <LinearGradient
              colors={['rgba(210,235,248,0.18)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.modalTopLine}
            />
            <Text style={S.modalTitle}>新建作品</Text>
            <View style={S.modalInputRow}>
              <TextInput
                style={S.modalInput}
                placeholder="作品名称"
                placeholderTextColor="rgba(210,235,248,0.22)"
                selectionColor="rgba(210,235,248,0.5)"
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[S.confirmBtn, newName.trim() ? S.confirmBtnActive : S.confirmBtnDisabled]}
                onPress={handleCreate}
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

      {/* ── Modal: Action Sheet ── */}
      <Modal visible={!!actionTarget} transparent animationType="slide" onRequestClose={() => setActionTarget(null)}>
        <Pressable style={S.sheetOverlay} onPress={() => setActionTarget(null)}>
          <Pressable style={S.sheet} onPress={() => {}}>
            <LinearGradient
              colors={['rgba(210,235,248,0.14)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.modalTopLine}
            />
            {actionTarget && (
              <Text style={S.sheetTitle}>{actionTarget.name}</Text>
            )}
            <TouchableOpacity style={S.sheetItem} onPress={() => {
              const t = actionTarget!
              setActionTarget(null)
              setRenameText(t.name)
              setRenameTarget(t)
            }}>
              <PencilIcon />
              <Text style={S.sheetItemText}>重命名</Text>
            </TouchableOpacity>
            <View style={S.sheetDivider} />
            <TouchableOpacity style={S.sheetItem} onPress={() => handleDeleteRequest(actionTarget!)}>
              <TrashIcon />
              <Text style={[S.sheetItemText, S.sheetItemDanger]}>删除作品</Text>
            </TouchableOpacity>
            <View style={S.sheetDivider} />
            <TouchableOpacity style={[S.sheetItem, { justifyContent: 'center' }]} onPress={() => setActionTarget(null)}>
              <Text style={S.sheetCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal: Rename ── */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={S.modalOverlay} onPress={() => setRenameTarget(null)}>
          <Pressable style={S.modalBox} onPress={() => {}}>
            <LinearGradient
              colors={['rgba(210,235,248,0.18)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={S.modalTopLine}
            />
            <Text style={S.modalTitle}>重命名作品</Text>
            <View style={S.modalInputRow}>
              <TextInput
                style={S.modalInput}
                value={renameText}
                onChangeText={setRenameText}
                selectionColor="rgba(210,235,248,0.5)"
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

      {/* ── Modal: Confirm/Delete ── */}
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
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04060c' },

  // Brand area
  brandArea: {
    position: 'absolute', top: STATUS_H, left: 0, right: 0,
    height: BRAND_H,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    zIndex: 1,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gem: {
    width: 7, height: 7,
    backgroundColor: 'rgba(210,235,248,0.7)',
    transform: [{ rotate: '45deg' }],
  },
  brandSub: {
    fontSize: 9, letterSpacing: 3.5,
    color: 'rgba(210,235,248,0.2)',
  },

  // Project list
  list: {
    position: 'absolute',
    top: STATUS_H + BRAND_H,
    left: 0, right: 0,
    bottom: BOT_NAV_H,
  },
  listContent: { paddingTop: 0, paddingBottom: 24 },

  newProjBtn: {
    marginHorizontal: 24, marginBottom: 16,
    height: 52,
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.15)', borderStyle: 'solid',
    borderRadius: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  newProjText: { fontSize: 11, letterSpacing: 2.2, color: 'rgba(210,235,248,0.3)' },
  plusIcon: { width: 16, height: 16, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  plusH: { position: 'absolute', width: 10, height: 1, backgroundColor: 'rgba(210,235,248,0.25)', borderRadius: 1 },
  plusV: { position: 'absolute', width: 1, height: 10, backgroundColor: 'rgba(210,235,248,0.25)', borderRadius: 1 },

  // Card
  card: {
    marginHorizontal: 24, marginBottom: 12,
    backgroundColor: 'rgba(2,4,8,0.58)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.07)',
    borderRadius: 8, overflow: 'hidden',
    position: 'relative',
  },
  cardTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  cardInner: { padding: 16, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  cardName: { fontSize: 14, letterSpacing: 1.2, fontWeight: '600', color: 'rgba(235,242,248,0.88)' },
  cardMeta: { fontSize: 10, letterSpacing: 1.2, color: 'rgba(210,235,248,0.28)', marginTop: 3 },
  moreBtn: { paddingHorizontal: 4 },
  moreBtnText: { fontSize: 14, color: 'rgba(210,235,248,0.25)' },
  divider: { height: 1, marginBottom: 12 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 0 },
  cardBtn: {
    flex: 1, height: 34,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 4,
  },
  cardBtnEdit: {
    backgroundColor: 'rgba(210,235,248,0.05)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.12)',
  },
  cardBtnEditText: { fontSize: 10, letterSpacing: 2.2, color: 'rgba(210,235,248,0.55)' },
  cardBtnPlay: {
    backgroundColor: 'rgba(210,235,248,0.08)',
    borderWidth: 1, borderColor: 'rgba(210,235,248,0.28)',
  },
  cardBtnPlayDisabled: { opacity: 0.3 },
  cardBtnPlayText: { fontSize: 10, letterSpacing: 2.2, color: 'rgba(210,235,248,0.55)' },
  gemSmall: { width: 5, height: 5, backgroundColor: 'rgba(210,235,248,0.55)', transform: [{ rotate: '45deg' }] },

  // Bottom nav
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: BOT_NAV_H,
    flexDirection: 'row', alignItems: 'flex-start', paddingTop: 14, paddingHorizontal: 10,
  },
  bottomNavBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(210,235,248,0.06)' },
  navItem: { flex: 1, alignItems: 'center', gap: 4 },
  navLabel: { fontSize: 9, letterSpacing: 2, color: 'rgba(210,235,248,0.3)' },
  navLabelActive: { color: 'rgba(210,235,248,0.7)' },

  // Modals
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

  // Action sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'rgba(3,5,12,0.97)',
    borderTopLeftRadius: 14, borderTopRightRadius: 14, overflow: 'hidden',
    borderTopWidth: 1, borderColor: 'rgba(210,235,248,0.1)',
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 11, letterSpacing: 2, color: 'rgba(210,235,248,0.35)',
    paddingHorizontal: 24, paddingTop: 18, paddingBottom: 12,
  },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 24 },
  sheetItemText: { fontSize: 13, letterSpacing: 1.5, color: 'rgba(210,235,248,0.75)' },
  sheetItemDanger: { color: 'rgba(210,110,110,0.8)' },
  sheetDivider: { height: 1, backgroundColor: 'rgba(210,235,248,0.06)', marginHorizontal: 24 },
  sheetCancelText: { fontSize: 13, letterSpacing: 1.5, color: 'rgba(210,235,248,0.35)' },
})
