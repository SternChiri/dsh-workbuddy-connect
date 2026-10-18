/**
 * The plugin detail page's balance quick-view section.
 *
 * The composer credit badge's on/off switch lives here rather than in the
 * bundle's configuration page because that page is the two variants' status
 * cards; a preference that governs the composer seat deserves its own section
 * on the detail page, where the host leaves the chrome to the plugin.
 *
 * The switch is bundle-level: one preference for both variants' composer
 * badges. It reads whichever variant's status document arrives first — the
 * current value and the probe key are the same on both — and posts its write
 * to that variant's probe route, where the host forwards it to the config
 * editor. The document's `setBalanceQuickViewAvailable` field is the
 * capability signal (same convention as `useMaximumContextWindow`): a host
 * without a persistence channel omits it, and this section renders no switch.
 *
 * The section has two seats: the detail page's `plugins.detail.section` slot,
 * and the top of the bundle's own configuration page, above the two variant
 * cards. Both render the same component.
 *
 * After a successful save the host reconciles the plugin's config, which
 * reloads this plugin and this client contribution with it — the switch comes
 * back reading the new value. An optimistic flip is therefore unnecessary and
 * wrong: the checkbox always reports the document, like the card's other
 * preference checkboxes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `plugins.detail.section` SlotMap entry, declared by the
// Plugins page. A value import would fail the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { WORKBUDDY_PROBE_PATH, WORKBUDDY_STATUS_PATH } from '../status-paths.ts'
import type { WorkBuddyWebStatus } from '../status-paths.ts'
import { isWorkBuddyWebStatus } from './status-document.ts'
import type { WorkBuddySettingsKey } from './locales.ts'

/** Props this section accepts. The detail page passes the page's subject; the
 * configuration page embeds the section directly and omits it. */
export type WorkBuddyQuickViewSectionProps =
  Partial<Pick<PropsRuntime<'plugins.detail.section'>, 'subject'>>
  & PropsLocale<'settings.workbuddy'>

/** The bundle this section answers for; any other subject renders nothing. */
const BUNDLE_NAME = 'dsh-workbuddy-connect'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}
/* Same bordered preference row the cards use for their context preference, so
 * the two checkbox kinds read as one plugin's controls. */
const preferenceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '10px 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  lineHeight: '20px',
}
const copyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
const hintStyle: CSSProperties = { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }
const errorStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }

/**
 * Render the section for the plugin's own bundle. The detail page dispatches
 * with a `subject`; the configuration page embeds this section above its cards
 * with no subject, and both seats answer for the same bundle-level preference.
 * A foreign subject (another bundle's detail page) renders nothing.
 */
export function WorkBuddyQuickViewSection({ subject, t }: WorkBuddyQuickViewSectionProps): ReactNode {
  if (subject !== undefined && (subject.kind !== 'bundle' || subject.pkg.name !== BUNDLE_NAME)) return null
  return <QuickViewSectionInner t={t} />
}

function QuickViewSectionInner({ t }: { t: (key: WorkBuddySettingsKey, params?: Record<string, unknown>) => string }): ReactNode {
  const [status, setStatus] = useState<WorkBuddyWebStatus | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(WORKBUDDY_STATUS_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const value: unknown = await response.json()
      if (!isWorkBuddyWebStatus(value)) return
      if (mounted.current) setStatus(value)
    } catch {
      // The document is a read; a failed one leaves the last known state in
      // place, exactly like the card's refresh policy.
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const enabled = status?.status === 'signed-in' && status.showBalanceQuickView !== false
  const canPersist = status?.status === 'signed-in' && status.setBalanceQuickViewAvailable === true
  const probeKey = status?.status === 'signed-in' ? status.probeKey : undefined

  const toggle = useCallback(async (next: boolean): Promise<void> => {
    if (probeKey === undefined || saving) return
    setSaving(true)
    setFailure(undefined)
    try {
      const response = await fetch(WORKBUDDY_PROBE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workbuddy-Probe-Key': probeKey },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'set-balance-quick-view', enabled: next }),
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) {
        const message = typeof value === 'object' && value !== null && 'error' in value
          ? String((value as Record<string, unknown>)['error'])
          : `HTTP ${response.status}`
        throw new Error(message)
      }
      if (typeof value !== 'object' || value === null || (value as Record<string, unknown>)['state'] !== 'updated') {
        const reason = typeof value === 'object' && value !== null && 'reason' in value
          ? String((value as Record<string, unknown>)['reason'])
          : t('requestFailed')
        throw new Error(reason)
      }
      // The host reconciles the config, which reloads this plugin; re-read
      // anyway so the checkbox settles on the document's answer even if the
      // reload is delayed or this instance survives it.
      await refresh()
    } catch (error: unknown) {
      if (mounted.current) {
        setFailure(error instanceof Error ? error.message : t('requestFailed'))
      }
    } finally {
      if (mounted.current) setSaving(false)
    }
  }, [probeKey, refresh, saving, t])

  // Signed-out or unreadable document: nothing to switch yet. The section
  // stays out of the way rather than showing a checkbox that cannot reflect
  // or change anything.
  if (status === undefined || status.status !== 'signed-in') return null

  return (
    <section style={sectionStyle}>
      <h3 style={headingStyle}>{t('quickViewHeading')}</h3>
      {canPersist ? (
        <label style={preferenceStyle}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={event => { void toggle(event.currentTarget.checked) }}
          />
          <span style={copyStyle}>
            <span>{t('quickViewToggle')}</span>
            <span style={hintStyle}>{t('quickViewToggleHint')}</span>
          </span>
        </label>
      ) : null}
      {failure === undefined ? null : <p style={errorStyle}>{t('quickViewSaveFailed', { message: failure })}</p>}
    </section>
  )
}
