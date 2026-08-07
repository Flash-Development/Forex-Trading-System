import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../i18n/translations'
import { Container } from './Container'

interface HeaderProps {
  simple?: boolean // For login/register pages
}

export function Header({ simple = false }: HeaderProps) {
  const { language, setLanguage } = useLanguage()

  return (
    <header className="glass sticky top-0 z-50 backdrop-blur-xl">
      <Container className="py-4">
        <div className="flex items-center justify-between">
          {/* Left - Logo and Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <img src="/icons/fts.png" alt="FTS Logo" className="w-8 h-8" />
            </div>
            <div>
              <h1
                className="text-xl font-bold"
                style={{ color: 'var(--color-text)' }}
              >
                {t('appTitle', language)}
              </h1>
              {!simple && (
                <p
                  className="text-xs mono"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {t('subtitle', language)}
                </p>
              )}
            </div>
          </div>

          {/* Right - Language Toggle (always show) */}
          <div
            className="flex gap-1 rounded p-1"
            style={{ background: 'var(--color-card)' }}
          >
            <button
              onClick={() => setLanguage('zh')}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={
                language === 'zh'
                  ? { background: 'var(--color-primary)', color: '#000' }
                  : { background: 'transparent', color: 'var(--color-muted)' }
              }
            >
              中文
            </button>
            <button
              onClick={() => setLanguage('en')}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={
                language === 'en'
                  ? { background: 'var(--color-primary)', color: '#000' }
                  : { background: 'transparent', color: 'var(--color-muted)' }
              }
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('id')}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={
                language === 'id'
                  ? { background: 'var(--color-primary)', color: '#000' }
                  : { background: 'transparent', color: 'var(--color-muted)' }
              }
            >
              ID
            </button>
          </div>
        </div>
      </Container>
    </header>
  )
}
