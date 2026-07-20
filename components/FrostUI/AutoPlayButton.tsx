/**
 * AutoPlayButton · 右上角自动播放键
 *
 * 关闭态：圆弧 + 三角，灰暗静止。
 * 开启态：
 *   - Animated.View 包裹圆弧 SVG → rotate 旋转 2.4s linear loop
 *   - Animated.View 包裹三角 SVG → opacity 脉冲 1.6s ease-in-out loop
 */

import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated'
import Svg, { Path, Polyline, Polygon } from 'react-native-svg'

interface Props {
  active: boolean
  onToggle: () => void
}

export default function AutoPlayButton({ active, onToggle }: Props) {
  const rotation = useSharedValue(0)  // 圆弧旋转角度 0~360
  const triOpacity = useSharedValue(0.28)  // 三角 opacity

  useEffect(() => {
    if (active) {
      // 圆弧：无限旋转
      rotation.value = withRepeat(
        withTiming(360, { duration: 2400, easing: Easing.linear }),
        -1,
        false,
      )
      // 三角：0.72 ↔ 1.0，1.6s/cycle（每半程 800ms）
      triOpacity.value = 0.72
      triOpacity.value = withRepeat(
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      )
    } else {
      cancelAnimation(rotation)
      cancelAnimation(triOpacity)
      rotation.value = 0
      triOpacity.value = 0.28
    }
  }, [active])

  const arcAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const triAnimStyle = useAnimatedStyle(() => ({
    opacity: triOpacity.value,
  }))

  const arcColor = active ? 'rgba(210,235,248,0.85)' : 'rgba(210,235,248,0.28)'

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      style={[styles.btn, active ? styles.btnOn : styles.btnOff]}
    >
      {/* 圆弧 + 箭头（旋转层） */}
      <Animated.View style={[styles.icon, arcAnimStyle]}>
        <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
          <Path
            d="M 8 2.5 A 5.5 5.5 0 1 1 3.0 5.2"
            stroke={arcColor}
            strokeWidth={1.35}
            strokeLinecap="round"
          />
          <Polyline
            points="1.4,6.2 3.0,5.2 4.4,6.8"
            stroke={arcColor}
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>

      {/* 三角（发光脉冲层，叠在圆弧上方） */}
      <Animated.View style={[styles.icon, triAnimStyle]}>
        <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
          <Polygon points="6,5.2 6,10.8 11,8" fill="rgba(210,235,248,1)" />
        </Svg>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: 36,
    right: 18,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOff: {
    backgroundColor: 'rgba(3,5,10,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(210,235,248,0.10)',
  },
  btnOn: {
    backgroundColor: 'rgba(210,235,248,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(210,235,248,0.30)',
  },
  icon: {
    position: 'absolute',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
