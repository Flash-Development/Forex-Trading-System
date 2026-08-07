interface IconProps {
  width?: number
  height?: number
  className?: string
}

// AI model colors for fallback display
const MODEL_COLORS: Record<string, string> = {
  deepseek: 'var(--color-model-deepseek)',
  qwen: 'var(--color-chart-bb)',
  claude: 'var(--color-model-claude)',
  kimi: 'var(--color-model-kimi)',
  gemini: 'var(--color-model-gemini)',
  grok: 'var(--color-bg)',
  openai: 'var(--color-model-openai)',
  minimax: 'var(--color-model-minimax)',
  claw402: 'var(--color-model-claw402)',
}

// 获取AI模型图标的函数
export const getModelIcon = (modelType: string, props: IconProps = {}) => {
  // 支持完整ID或类型名
  const type = modelType.includes('_') ? modelType.split('_').pop() : modelType

  let iconPath: string | null = null

  switch (type) {
    case 'deepseek':
      iconPath = '/icons/deepseek.svg'
      break
    case 'qwen':
      iconPath = '/icons/qwen.svg'
      break
    case 'claude':
      iconPath = '/icons/claude.svg'
      break
    case 'kimi':
      iconPath = '/icons/kimi.svg'
      break
    case 'gemini':
      iconPath = '/icons/gemini.svg'
      break
    case 'grok':
      iconPath = '/icons/grok.svg'
      break
    case 'openai':
      iconPath = '/icons/openai.svg'
      break
    case 'minimax':
      iconPath = '/icons/minimax.svg'
      break
    case 'claw402':
      iconPath = '/icons/claw402.png'
      break
    default:
      return null
  }

  return (
    <img
      src={iconPath}
      alt={`${type} icon`}
      width={props.width || 24}
      height={props.height || 24}
      className={props.className}
    />
  )
}

// 获取模型颜色（用于没有图标时的fallback）
export const getModelColor = (modelType: string): string => {
  const type = modelType.includes('_') ? modelType.split('_').pop() : modelType
  return MODEL_COLORS[type || ''] || 'var(--color-primary-3)'
}
