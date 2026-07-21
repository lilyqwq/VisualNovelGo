import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Shared types (also used by PlayerScreen and FrameEditorScreen) ─────────────

export type DialogType = 'dialogue' | 'narration' | 'emphasis' | 'cutscene'

// ── 播放画幅（作品级设置） ────────────────────────────────────────────────────
// full  = 全屏铺满；9:16 / 3:4 在竖屏机上表现为上下黑边、场景宽度 = 屏宽。
export type AspectRatio = 'full' | '9:16' | '3:4'
export const ASPECT_CYCLE: AspectRatio[] = ['full', '9:16', '3:4']
export const ASPECT_LABEL: Record<AspectRatio, string> = {
  full: '全屏',
  '9:16': '9:16',
  '3:4': '3:4',
}

export interface EditorFrame {
  id: string
  dialogType: DialogType
  characterId: string | null
  text: string
  backgroundId: string | null
  spriteId: string | null
  spriteOverride: { scale: number; offsetX: number; offsetY: number } | null
  transition: boolean
  cutsceneDuration?: number
  // Per-frame style overrides
  dialogFontSize?: number
  emphasisFontSize?: number
  emphasisLineHeight?: number
  emphasisColor?: 'white' | 'black' | 'red'
  emphasisAlign?: 'center' | 'left' | 'right'
}

export interface Project {
  id: string
  name: string
  chapters: Chapter[]
  aspectRatio?: AspectRatio   // 作品级播放画幅，缺省按 'full' 处理（兼容旧数据）
}

export interface Chapter {
  id: string
  name: string
  frames: EditorFrame[]
}

// ── Library record types ───────────────────────────────────────────────────────

interface BgRecord     { id: string; uri: string; name: string }
interface SpriteRecord {
  id: string; uri: string; name: string
  defaultScale?: number; defaultOffsetX?: number; defaultOffsetY?: number
}
interface CharRecord   { id: string; name: string; defaultSpriteId: string | null }

// ── Resolved per-frame assets ──────────────────────────────────────────────────

export interface FrameAssets {
  backgroundUri: string | null    // file URI for image backgrounds
  backgroundColor: string | null  // '#000000' / '#ffffff' for builtin backgrounds
  spriteUri: string | null
  characterName: string | null
}

// ── Built-in background IDs (not stored in AsyncStorage) ──────────────────────

export const BUILTIN_BLACK_ID = '__builtin_black'
export const BUILTIN_WHITE_ID = '__builtin_white'

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const KEY_BG   = 'library_backgrounds_v1'
const KEY_SP   = 'library_sprites_v1'
const KEY_CHAR = 'library_characters_v1'

async function loadList<T>(key: string): Promise<T[]> {
  try {
    const r = await AsyncStorage.getItem(key)
    return r ? JSON.parse(r) : []
  } catch {
    return []
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// Returns a FrameAssets[] that parallels the input frames array.
// null backgroundId = inherit from previous frame's resolved background.
// Re-loads library data from AsyncStorage on mount.

export function useFrameResolver(frames: EditorFrame[]): FrameAssets[] {
  const [bgMap,     setBgMap]     = useState<Record<string, BgRecord>>({})
  const [spriteMap, setSpriteMap] = useState<Record<string, SpriteRecord>>({})
  const [charMap,   setCharMap]   = useState<Record<string, CharRecord>>({})

  useEffect(() => {
    loadList<BgRecord>(KEY_BG).then(list =>
      setBgMap(Object.fromEntries(list.map(b => [b.id, b])))
    )
    loadList<SpriteRecord>(KEY_SP).then(list =>
      setSpriteMap(Object.fromEntries(list.map(s => [s.id, s])))
    )
    loadList<CharRecord>(KEY_CHAR).then(list =>
      setCharMap(Object.fromEntries(list.map(c => [c.id, c])))
    )
  }, [])

  // Computed synchronously from current map state — no extra state needed.
  // Runs on every render; cost is O(frames.length) which is trivial.
  const resolved: FrameAssets[] = []
  let lastBgUri: string | null   = null
  let lastBgColor: string | null = null

  for (const frame of frames) {
    let backgroundUri: string | null   = null
    let backgroundColor: string | null = null

    if (frame.backgroundId === BUILTIN_BLACK_ID) {
      backgroundColor = '#000000'
      lastBgUri   = null
      lastBgColor = '#000000'
    } else if (frame.backgroundId === BUILTIN_WHITE_ID) {
      backgroundColor = '#ffffff'
      lastBgUri   = null
      lastBgColor = '#ffffff'
    } else if (frame.backgroundId !== null) {
      const bg = bgMap[frame.backgroundId]
      if (bg) {
        backgroundUri = bg.uri
        lastBgUri   = bg.uri
        lastBgColor = null
      }
    } else {
      // null → inherit from previous frame
      backgroundUri   = lastBgUri
      backgroundColor = lastBgColor
    }

    const spriteUri     = frame.spriteId     ? (spriteMap[frame.spriteId]?.uri  ?? null) : null
    const characterName = frame.characterId  ? (charMap[frame.characterId]?.name ?? null) : null

    resolved.push({ backgroundUri, backgroundColor, spriteUri, characterName })
  }

  return resolved
}

// ── projects_v1 helpers ───────────────────────────────────────────────────────

const KEY_PROJECTS = 'projects_v1'

function makeDefaultFrame(): EditorFrame {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    dialogType: 'narration',
    characterId: null,
    text: '',
    backgroundId: null,
    spriteId: null,
    spriteOverride: null,
    transition: false,
  }
}

export async function loadProjects(): Promise<Project[]> {
  try {
    const r = await AsyncStorage.getItem(KEY_PROJECTS)
    return r ? JSON.parse(r) : []
  } catch {
    return []
  }
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await AsyncStorage.setItem(KEY_PROJECTS, JSON.stringify(projects))
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export async function createProject(name: string): Promise<Project> {
  const projects = await loadProjects()
  const newProject: Project = { id: makeId(), name, chapters: [], aspectRatio: 'full' }
  await saveProjects([...projects, newProject])
  return newProject
}

export async function renameProject(id: string, name: string): Promise<void> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === id)
  if (proj) { proj.name = name; await saveProjects(projects) }
}

// 设置作品级播放画幅（全屏 / 9:16 / 3:4）
export async function updateProjectAspect(id: string, aspect: AspectRatio): Promise<void> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === id)
  if (proj) { proj.aspectRatio = aspect; await saveProjects(projects) }
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await loadProjects()
  await saveProjects(projects.filter(p => p.id !== id))
}

export async function createChapter(projectId: string, name: string): Promise<Chapter> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === projectId)
  if (!proj) throw new Error('Project not found')
  const newChapter: Chapter = { id: makeId(), name, frames: [makeDefaultFrame()] }
  proj.chapters.push(newChapter)
  await saveProjects(projects)
  return newChapter
}

export async function renameChapter(projectId: string, chapterId: string, name: string): Promise<void> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === projectId)
  if (!proj) return
  const ch = proj.chapters.find(c => c.id === chapterId)
  if (ch) { ch.name = name; await saveProjects(projects) }
}

export async function deleteChapter(projectId: string, chapterId: string): Promise<void> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === projectId)
  if (!proj) return
  proj.chapters = proj.chapters.filter(c => c.id !== chapterId)
  await saveProjects(projects)
}

export async function moveChapter(projectId: string, chapterId: string, direction: 'up' | 'down'): Promise<void> {
  const projects = await loadProjects()
  const proj = projects.find(p => p.id === projectId)
  if (!proj) return
  const idx = proj.chapters.findIndex(c => c.id === chapterId)
  if (idx < 0) return
  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (newIdx < 0 || newIdx >= proj.chapters.length) return
  const chapters = [...proj.chapters]
  ;[chapters[idx], chapters[newIdx]] = [chapters[newIdx], chapters[idx]]
  proj.chapters = chapters
  await saveProjects(projects)
}

// Load frames for a given chapterId.
// If chapter not found, creates a new default chapter inside a default project.
export async function loadChapterFrames(chapterId: string): Promise<EditorFrame[]> {
  const projects = await loadProjects()
  for (const proj of projects) {
    const ch = proj.chapters.find(c => c.id === chapterId)
    if (ch) return ch.frames.length > 0 ? ch.frames : [makeDefaultFrame()]
  }
  // Chapter not found → bootstrap
  const newChapter: Chapter = { id: chapterId, name: '第一章', frames: [makeDefaultFrame()] }
  const newProject: Project = { id: 'default_project', name: '我的作品', chapters: [newChapter] }
  // Merge: if a "default_project" already exists, append the chapter
  const existing = projects.find(p => p.id === 'default_project')
  if (existing) {
    existing.chapters.push(newChapter)
    await saveProjects(projects)
  } else {
    await saveProjects([...projects, newProject])
  }
  return newChapter.frames
}

// Persist updated frames for a given chapterId.
// If chapter/project doesn't exist, creates it.
export async function saveChapterFrames(chapterId: string, frames: EditorFrame[]): Promise<void> {
  const projects = await loadProjects()
  for (const proj of projects) {
    const ch = proj.chapters.find(c => c.id === chapterId)
    if (ch) {
      ch.frames = frames
      await saveProjects(projects)
      return
    }
  }
  // Chapter not found → create
  const newChapter: Chapter = { id: chapterId, name: '第一章', frames }
  const existing = projects.find(p => p.id === 'default_project')
  if (existing) {
    existing.chapters.push(newChapter)
    await saveProjects(projects)
  } else {
    await saveProjects([...projects, { id: 'default_project', name: '我的作品', chapters: [newChapter] }])
  }
}
