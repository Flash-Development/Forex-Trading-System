// FTS (Flash Trading System) Branding Constants

export const OFFICIAL_LINKS = {
  twitter: 'https://x.com/FlashTradingSystem',
  telegram: 'https://t.me/FlashTradingSystem',
  github: 'https://github.com/Flash-Development/Flash-Tradaing-System',
} as const

export const BRAND_INFO = {
  name: 'FTS',
  fullName: 'Flash Trading System',
  tagline: 'AI Trading Platform',
  version: '1.0.0',
  social: {
    x: () => OFFICIAL_LINKS.twitter,
    tg: () => OFFICIAL_LINKS.telegram,
    gh: () => OFFICIAL_LINKS.github,
  },
} as const
