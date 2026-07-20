// Frost 霜 · 设计 Token
// 所有颜色、尺寸从这里统一取，不要在组件里硬编码

export const FROST = {
  // 背景
  bg:          '#04060c' as const,
  bgAlt:       '#060810' as const,

  // 冰蓝主题色
  iceBlue:     '#c8e6f4' as const,
  iceBlueDim:  '#d2ebf8' as const,
  iceWhite:    '#eef6fc' as const,

  // 对话文字
  textMain:    'rgba(235,242,248,0.92)' as const,
  textDim:     'rgba(235,242,248,0.55)' as const,

  // 对话框背景（含透明度，传给 BlurView tint 或直接叠色）
  dialogBg:    'rgba(3,6,12,0.22)'      as const,
  narrBg:      'rgba(3,5,10,0.20)'      as const,

  // 装饰线颜色（用于 LinearGradient stops）
  lineStop0:   'rgba(210,235,248,0)'    as const,
  lineStop1:   'rgba(210,235,248,0.50)' as const,
  lineStop2:   'rgba(240,250,255,0.82)' as const,
  lineStop3:   'rgba(210,235,248,0.40)' as const,

  // 名字板
  namebar:     '#eef6fc'                as const,

  // 对话框底部固定位置
  dlgBottom:   72,

  // 边距
  dlgPadH:     40,   // 左右 padding（对白框）
  dlgPadHNarr: 48,   // 旁白框
  maskWidth:   36,   // 两侧渐隐宽度
}

// 预设背景（Scene 用）
export const BG_PRESETS = {
  dark:  '#060810',
  pink:  '#1a0810',
  purple:'#07040e',
  black: '#000000',
  white: '#ffffff',
} as const
