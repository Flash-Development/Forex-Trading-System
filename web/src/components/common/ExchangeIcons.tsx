import React from 'react'

interface IconProps {
  width?: number
  height?: number
  className?: string
}

// 本地图标路径映射
const ICON_PATHS: Record<string, string> = {
  binance: '/exchange-icons/binance.jpg',
  bybit: '/exchange-icons/bybit.png',
  okx: '/exchange-icons/okx.svg',
  bitget: '/exchange-icons/bitget.svg',
  gate: '/exchange-icons/gate.svg',
  kucoin: '/exchange-icons/kucoin.svg',
  hyperliquid: '/exchange-icons/hyperliquid.png',
  aster: '/exchange-icons/aster.svg',
  lighter: '/exchange-icons/lighter.png',
  indodax: '/exchange-icons/indodax.png',
}

// 通用图标组件
const ExchangeImage: React.FC<IconProps & { src: string; alt: string }> = ({
  width = 24,
  height = 24,
  className,
  src,
  alt,
}) => (
  <div
    className={className}
    style={{
      width,
      height,
      borderRadius: 6,
      overflow: 'hidden',
      flexShrink: 0,
      background: 'var(--color-border)',
    }}
  >
    <img
      src={src}
      alt={alt}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  </div>
)

// Fallback 图标
const FallbackIcon: React.FC<IconProps & { label: string }> = ({
  width = 24,
  height = 24,
  className,
  label,
}) => (
  <div
    className={className}
    style={{
      width,
      height,
      borderRadius: 6,
      background: 'var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.max(10, (width || 24) * 0.4),
      fontWeight: 'bold',
      color: 'var(--color-text)',
      flexShrink: 0,
    }}
  >
    {label[0]?.toUpperCase() || '?'}
  </div>
)

// 获取交易所图标的函数
export const getExchangeIcon = (
  exchangeType: string,
  props: IconProps = {}
) => {
  const lowerType = exchangeType.toLowerCase()
  const type = lowerType.includes('binance')
    ? 'binance'
    : lowerType.includes('bybit')
      ? 'bybit'
      : lowerType.includes('okx')
        ? 'okx'
        : lowerType.includes('bitget')
          ? 'bitget'
          : lowerType.includes('gate')
            ? 'gate'
            : lowerType.includes('kucoin')
              ? 'kucoin'
              : lowerType.includes('hyperliquid')
                ? 'hyperliquid'
                : lowerType.includes('aster')
                  ? 'aster'
                  : lowerType.includes('lighter')
                    ? 'lighter'
                    : lowerType.includes('indodax')
                      ? 'indodax'
                      : lowerType.includes('mt5') || lowerType.includes('metatrader')
                        ? 'mt5'
                        : lowerType

  const iconProps = {
    width: props.width || 24,
    height: props.height || 24,
    className: props.className,
  }

  const path = ICON_PATHS[type]
  if (path) {
    return <ExchangeImage {...iconProps} src={path} alt={type} />
  }

  // MT5 — inline SVG badge (no image file needed)
  if (type === 'mt5') {
    return (
      <div
        className={iconProps.className}
        style={{
          width: iconProps.width,
          height: iconProps.height,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #1a3a52 0%, #0d2035 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid rgba(16,185,129,0.3)',
        }}
      >
        <span
          style={{
            fontSize: Math.max(8, (iconProps.width || 24) * 0.35),
            fontWeight: 'bold',
            color: 'var(--color-success)',
            fontFamily: 'monospace',
            letterSpacing: '-0.5px',
          }}
        >
          MT5
        </span>
      </div>
    )
  }

  return <FallbackIcon {...iconProps} label={type} />
}
