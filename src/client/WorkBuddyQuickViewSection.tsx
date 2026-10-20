/**
 * The bundle configuration page's balance quick-view section.
 *
 * The composer credit badge's on/off switch lives at the top of the bundle's
 * configuration page, above the two variants' status cards: a preference that
 * governs the composer seat sits before the diagnostic cards.
 *
 * The switch is bundle-level: one preference for both variants' composer
 * badges. Both variants serve their own status document and probe route, and
 * only the signed-in one answers — so this section asks the domestic route
 * first and falls back to the international one, then keeps whichever
 * document answered for the write. Hard-coding one region's paths would hide
 * the switch on a host signed in to the other region.
 *
 * The document's `setBalanceQuickViewAvailable` field is the capability signal
 * (same convention as `useMaximumContextWindow`): a host without a persistence
 * channel omits it, and this section renders no switch.
 *
 * After a successful save the host reconciles the plugin's config, which
 * reloads this plugin and this client contribution with it — the switch comes
 * back reading the new value. An optimistic flip is therefore unnecessary and
 * wrong: the checkbox always reports the document, like the card's other
 * preference checkboxes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { WORKBUDDY_AI_PROBE_PATH, WORKBUDDY_AI_STATUS_PATH, WORKBUDDY_PROBE_PATH, WORKBUDDY_STATUS_PATH } from '../status-paths.ts'
import type { WorkBuddyWebStatus } from '../status-paths.ts'
import { isWorkBuddyWebStatus } from './status-document.ts'
import type { WorkBuddySettingsKey } from './locales.ts'

/** Props this section accepts. The configuration page embeds the section directly. */
export type WorkBuddyQuickViewSectionProps = PropsLocale<'settings.workbuddy'>

/**
 * The two variants' control channels, domestic first. A signed-in document
 * names the region that is actually in use; a signed-out one answers from
 * either route, so the pair is tried in order and the first signed-in answer
 * wins.
 */
const CHANNELS: readonly { statusPath: string, probePath: string }[] = [
  { statusPath: WORKBUDDY_STATUS_PATH, probePath: WORKBUDDY_PROBE_PATH },
  { statusPath: WORKBUDDY_AI_STATUS_PATH, probePath: WORKBUDDY_AI_PROBE_PATH },
]

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

/** One channel's answering status document, or `undefined` when it did not answer. */
async function readStatus(statusPath: string): Promise<WorkBuddyWebStatus | undefined> {
  try {
    const response = await fetch(statusPath, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) return undefined
    const value: unknown = await response.json()
    return isWorkBuddyWebStatus(value) ? value : undefined
  } catch {
    // A read that failed is a channel that did not answer; the caller keeps
    // looking, exactly like the card's refresh policy.
    return undefined
  }
}

/** Render the section; the configuration page embeds it above its cards. */
export function WorkBuddyQuickViewSection({ t }: WorkBuddyQuickViewSectionProps): ReactNode {
  return <QuickViewSectionInner t={t} />
}

/** A signing-in document wins over a signed-out one, whichever route answered. */
function preferred(current: WorkBuddyWebStatus | undefined, candidate: WorkBuddyWebStatus): WorkBuddyWebStatus {
  if (current === undefined) return candidate
  if (current.status !== 'signed-in' && candidate.status === 'signed-in') return candidate
  return current
}

function QuickViewSectionInner({ t }: { t: (key: WorkBuddySettingsKey, params?: Record<string, unknown>) => string }): ReactNode {
  const [status, setStatus] = useState<WorkBuddyWebStatus | undefined>(undefined)
  const [channel, setChannel] = useState<{ statusPath: string, probePath: string }>(CHANNELS[0]!)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    let answer: WorkBuddyWebStatus | undefined
    let answered = CHANNELS[0]!
    for (const candidate of CHANNELS) {
      const document = await readStatus(candidate.statusPath)
      if (document === undefined) continue
      if (answer === undefined) answered = candidate
      const next = preferred(answer, document)
      // Remember which route produced the winning document: that route's probe
      // endpoint is the only one that accepts the write for that variant.
      if (next !== answer) answered = candidate
      answer = next
      if (answer?.status === 'signed-in') break
    }
    if (!mounted.current || answer === undefined) return
    setStatus(answer)
    setChannel(answered)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Absence of the field means "on": a host that predates it keeps showing the
  // badge. Only an explicit `false` turns the quick view off.
  const enabled = status?.status === 'signed-in' && status.showBalanceQuickView !== false
  const canPersist = status?.status === 'signed-in' && status.setBalanceQuickViewAvailable === true
  const probeKey = status?.status === 'signed-in' ? status.probeKey : undefined

  const toggle = useCallback(async (next: boolean): Promise<void> => {
    if (probeKey === undefined || saving) return
    setSaving(true)
    setFailure(undefined)
    try {
      const response = await fetch(channel.probePath, {
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
  }, [channel, probeKey, refresh, saving, t])

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
