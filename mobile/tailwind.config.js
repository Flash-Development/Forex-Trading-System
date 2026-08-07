/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // FTS Dark Fintech AI palette
        nofx: {
          bg:        '#000000',
          surface:   '#121826',
          card:      '#1A2236',
          border:    '#2A344A',
          primary:   '#3B82F6',
          secondary: '#22D3EE',
          success:   '#10B981',
          danger:    '#EF4444',
          warning:   '#F59E0B',
          text:      '#E5E7EB',
          muted:     '#9CA3AF',
        },
        // Legacy aliases kept for NativeWind class compatibility
        gold: {
          DEFAULT: '#3B82F6',
          dim: 'rgba(59,130,246,0.12)',
          glow: 'rgba(59,130,246,0.4)',
        },
        bg: {
          DEFAULT: '#000000',
          deeper:  '#000000',
          lighter: '#1A2236',
        },
        accent: '#22D3EE',
        text: {
          primary:   '#E5E7EB',
          secondary: '#9CA3AF',
          tertiary:  '#6B7280',
          disabled:  '#4B5563',
        },
        success: '#10B981',
        danger:  '#EF4444',
        warning: '#F59E0B',
        panel:   '#1A2236',
      },
      fontFamily: {
        mono: ['Courier New', 'monospace'],
        sans: ['System', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
