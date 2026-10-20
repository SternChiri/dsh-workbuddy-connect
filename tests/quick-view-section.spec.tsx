import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyQuickViewSection, type WorkBuddyQuickViewSectionProps } from '../src/client/WorkBuddyQuickViewSection.tsx'
import { en } from '../src/client/locales.ts'
import { WORKBUDDY_AI_PROBE_PATH, WORKBUDDY_AI_STATUS_PATH, WORKBUDDY_PROBE_PATH, WORKBUDDY_STATUS_PATH } from '../src/status-paths.ts'

/**
 * Configuration-page quick-view switch tests. The contract they pin down:
 *
 * - the checkbox always reports the status document, no optimistic flip,
 *   because a successful save reloads this plugin;
 * - the write goes to the probe route with the document's probe key and
 *   requires `state: 'updated'` before it counts as saved;
 * - `setBalanceQuickViewAvailable` presence is the capability signal: a host
 *   without a persistence channel keeps the switch hidden;
 * - the section is bundle-level, so it must find whichever region's routes
 *   answer: a host signed in to the international variant serves only the
 *   `ai` routes, and the switch has to appear and write there too.
 */

interface RouteAnswer {
  ok: boolean
  status?: number
  body: unknown
}

describe('Configuration-page balance quick-view switch', () => {
  let view: ReactTestRenderer | undefined
  /** Documents served per status path; a missing path does not answer at all. */
  let documents: Map<string, Record<string, unknown>>
  const request = vi.fn()
  const t: WorkBuddyQuickViewSectionProps['t'] = (key, params = {}) =>
    Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), en[key] as string)

  function signedIn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      status: 'signed-in',
      probeKey: 'test-key',
      showBalanceQuickView: true,
      setBalanceQuickViewAvailable: true,
      ...overrides,
    }
  }

  function serve(path: string, document: Record<string, unknown>): void {
    documents.set(path, document)
  }

  beforeEach(() => {
    documents = new Map()
    serve(WORKBUDDY_STATUS_PATH, signedIn())
    request.mockReset().mockImplementation(async (url: string, init?: RequestInit): Promise<RouteAnswer> => {
      if (init?.method !== 'POST') {
        const document = documents.get(url)
        return document === undefined
          ? { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
          : { ok: true, json: async () => document }
      }
      // A successful write lands in whichever document this route serves, the
      // way the host's config reconciliation does.
      const target = url === WORKBUDDY_AI_PROBE_PATH ? WORKBUDDY_AI_STATUS_PATH : WORKBUDDY_STATUS_PATH
      const document = documents.get(target)
      if (document === undefined) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
      const written = JSON.parse(String(init.body)) as { enabled: boolean }
      document['showBalanceQuickView'] = written.enabled
      return { ok: true, json: async () => ({ state: 'updated' }) }
    })
    vi.stubGlobal('fetch', request)
  })

  afterEach(() => {
    act(() => view?.unmount())
    view = undefined
    vi.unstubAllGlobals()
  })

  async function mount(props: Partial<WorkBuddyQuickViewSectionProps> = {}) {
    await act(async () => { view = create(createElement(WorkBuddyQuickViewSection, { t, ...props })) })
  }

  const checkbox = () => view!.root.findAllByType('input').find(node => node.props['type'] === 'checkbox')
  const posts = () => request.mock.calls.filter(([, init]) => init?.method === 'POST') as [string, RequestInit][]
  const reads = () => request.mock.calls.filter(([, init]) => init?.method !== 'POST').map(([url]) => url as string)

  it('renders the switch reflecting the document, checked when on', async () => {
    await mount()
    expect(checkbox()).toBeDefined()
    expect(checkbox()!.props['checked']).toBe(true)
    expect(view!.root.findByType('h3').children.join('')).toBe(en.quickViewHeading)
  })

  it('renders the switch unchecked when the preference is off', async () => {
    serve(WORKBUDDY_STATUS_PATH, signedIn({ showBalanceQuickView: false }))
    await mount()
    expect(checkbox()!.props['checked']).toBe(false)
  })

  it('treats a document without the field as on', async () => {
    const legacy = signedIn()
    delete legacy['showBalanceQuickView']
    serve(WORKBUDDY_STATUS_PATH, legacy)
    await mount()
    expect(checkbox()!.props['checked']).toBe(true)
  })

  it('writes through the domestic probe route when the domestic variant answers', async () => {
    await mount()
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(posts()).toHaveLength(1)
    const [url, init] = posts()[0]!
    expect(url).toBe(WORKBUDDY_PROBE_PATH)
    expect(JSON.parse(String(init.body))).toEqual({ action: 'set-balance-quick-view', enabled: false })
    expect((init.headers as Record<string, string>)['X-Workbuddy-Probe-Key']).toBe('test-key')
    // The checkbox settles on the refreshed document, not on the click.
    expect(checkbox()!.props['checked']).toBe(false)
  })

  it('finds the switch and writes through the international routes when only those answer', async () => {
    documents.clear()
    // A host signed in to the international variant: the domestic routes are
    // mounted but only answer signed-out, so the ai routes are the real ones.
    serve(WORKBUDDY_STATUS_PATH, { status: 'signed-out' })
    serve(WORKBUDDY_AI_STATUS_PATH, signedIn({ showBalanceQuickView: true }))
    await mount()
    expect(checkbox()).toBeDefined()
    expect(checkbox()!.props['checked']).toBe(true)
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(posts()).toHaveLength(1)
    const [url, init] = posts()[0]!
    expect(url).toBe(WORKBUDDY_AI_PROBE_PATH)
    expect(JSON.parse(String(init.body))).toEqual({ action: 'set-balance-quick-view', enabled: false })
    expect(checkbox()!.props['checked']).toBe(false)
  })

  it('prefers a signed-in answer over a signed-out one, whatever the order', async () => {
    documents.clear()
    // The domestic route answers first with a signed-out document; the
    // signed-in international one must still win.
    serve(WORKBUDDY_STATUS_PATH, { status: 'signed-out' })
    serve(WORKBUDDY_AI_STATUS_PATH, signedIn())
    await mount()
    expect(checkbox()).toBeDefined()
    expect(reads()).toEqual([WORKBUDDY_STATUS_PATH, WORKBUDDY_AI_STATUS_PATH])
  })

  it('stops asking once a region answers signed in', async () => {
    await mount()
    // The domestic document answered signed-in; the international route is
    // never consulted, so a broken mount there cannot hide the switch.
    expect(reads()).toEqual([WORKBUDDY_STATUS_PATH])
  })

  it('surfaces a failed save instead of flipping the checkbox', async () => {
    request.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        const document = documents.get(url)
        return document === undefined
          ? { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
          : { ok: true, json: async () => document }
      }
      return { ok: false, status: 404, json: async () => ({ error: 'balance-quick-view-setting-not-supported' }) }
    })
    await mount()
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(checkbox()!.props['checked']).toBe(true)
    expect(view!.root.findByType('p').children.join(''))
      .toBe(en.quickViewSaveFailed.replace('{message}', 'balance-quick-view-setting-not-supported'))
  })

  it('reports a write that did not reach the config as a failure', async () => {
    request.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return { ok: true, json: async () => documents.get(url)! }
      return { ok: true, json: async () => ({ state: 'failed', reason: 'configuration entry not found' }) }
    })
    await mount()
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(checkbox()!.props['checked']).toBe(true)
    expect(view!.root.findByType('p').children.join(''))
      .toBe(en.quickViewSaveFailed.replace('{message}', 'configuration entry not found'))
  })

  it('hides the switch when the host declares no persistence channel', async () => {
    serve(WORKBUDDY_STATUS_PATH, signedIn({ setBalanceQuickViewAvailable: false }))
    await mount()
    expect(checkbox()).toBeUndefined()
    // Older-host document without the field: same outcome.
    const legacy = signedIn()
    delete legacy['setBalanceQuickViewAvailable']
    serve(WORKBUDDY_STATUS_PATH, legacy)
    await mount()
    expect(checkbox()).toBeUndefined()
  })

  it('renders nothing when no region answers signed in', async () => {
    documents.clear()
    serve(WORKBUDDY_STATUS_PATH, { status: 'signed-out' })
    serve(WORKBUDDY_AI_STATUS_PATH, { status: 'signed-out' })
    await mount()
    expect(view!.toJSON()).toBeNull()
  })

  it('renders nothing when neither route answers', async () => {
    documents.clear()
    await mount()
    expect(view!.toJSON()).toBeNull()
    expect(reads()).toEqual([WORKBUDDY_STATUS_PATH, WORKBUDDY_AI_STATUS_PATH])
  })
})
