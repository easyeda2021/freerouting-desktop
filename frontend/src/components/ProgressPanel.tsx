import { useApp } from '../App'
import { t } from '../lib/i18n'

export default function ProgressPanel() {
  const { state } = useApp()
  const { jobState, jobStage, currentPass, score, language } = state

  const progress = jobState === 'COMPLETED' ? 100 : jobState === 'RUNNING' ? Math.min(currentPass * 2, 95) : 0

  return (
    <div style={s.panel}>
      <div style={s.row}>
        <span>{t('state', language)}: {jobState ? t(jobState.toLowerCase(), language) || jobState : t('idle', language)}</span>
        {jobStage && <span>{t('stage', language)}: {t(jobStage.toLowerCase(), language) || jobStage}</span>}
        {currentPass > 0 && <span>{t('pass', language)}: {currentPass}</span>}
        {score > 0 && <span>{t('score', language)}: {score.toFixed(2)}</span>}
      </div>
      <div style={s.bar}>
        <div style={{ ...s.fill, width: `${progress}%` }} />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    padding: '6px 12px',
    background: '#16213e',
    borderTop: '1px solid #0f3460',
    flexShrink: 0,
  },
  row: { display: 'flex', gap: 20, fontSize: 11, color: '#aaa', marginBottom: 4 },
  bar: { height: 4, background: '#0f3460', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', background: '#e94560', transition: 'width 0.5s' },
}
