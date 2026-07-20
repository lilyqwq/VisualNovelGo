import 'react-native-gesture-handler'  // 必须最先 import
import React, { useEffect, useRef, useState } from 'react'
import * as ScreenOrientation from 'expo-screen-orientation'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BackHandler, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import HomeScreen from './screens/HomeScreen'
import ChapterListScreen from './screens/ChapterListScreen'
import LibraryScreen from './screens/LibraryScreen'

type AppScreen =
  | { name: 'home' }
  | { name: 'chapters'; projectId: string; projectName: string; mode: 'edit' | 'play' }
  | { name: 'library' }

export default function App() {
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' })
  const screenRef      = useRef(screen)
  screenRef.current    = screen
  const exitPressedRef = useRef(false)
  const exitTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintOpacity    = useSharedValue(0)
  const hintAnimStyle  = useAnimatedStyle(() => ({ opacity: hintOpacity.value }))

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
  }, [])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenRef.current.name !== 'home') return false

      if (exitPressedRef.current) {
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
        BackHandler.exitApp()
        return true
      }

      exitPressedRef.current = true
      // 淡入提示
      hintOpacity.value = withTiming(1, { duration: 180 })
      exitTimerRef.current = setTimeout(() => {
        exitPressedRef.current = false
        // 淡出提示
        hintOpacity.value = withTiming(0, { duration: 250 })
      }, 2000)
      return true
    })
    return () => {
      sub.remove()
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  const goHome = () => setScreen({ name: 'home' })

  let content: React.ReactElement

  if (screen.name === 'library') {
    content = <LibraryScreen onBack={goHome} />
  } else if (screen.name === 'chapters') {
    content = (
      <ChapterListScreen
        projectId={screen.projectId}
        projectName={screen.projectName}
        mode={screen.mode}
        onBack={goHome}
      />
    )
  } else {
    content = (
      <HomeScreen
        onChapterEdit={(projectId, projectName) =>
          setScreen({ name: 'chapters', projectId, projectName, mode: 'edit' })
        }
        onChapterPlay={(projectId, projectName) =>
          setScreen({ name: 'chapters', projectId, projectName, mode: 'play' })
        }
        onLibrary={() => setScreen({ name: 'library' })}
      />
    )
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {content}
      <Animated.View style={[styles.exitHintWrap, hintAnimStyle]} pointerEvents="none">
        <View style={styles.exitHint}>
          <Text style={styles.exitHintText}>再按一次退出应用</Text>
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  exitHintWrap: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitHint: {
    backgroundColor: 'rgba(4,6,14,0.62)',
    borderRadius: 100,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  exitHintText: {
    color: 'rgba(210,235,248,0.82)',
    fontSize: 13,
    letterSpacing: 2,
  },
})
