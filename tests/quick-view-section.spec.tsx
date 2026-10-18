import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyQuickViewSection, type WorkBuddyQuickViewSectionProps } from '../src/client/WorkBuddyQuickViewSection.tsx'
import { en } from '../src/client/locales.ts'

/**
 * Detail-page quick-view switch tests. The contract they pin down:
 *
 * - the section renders only for this bundle's detail page (any other
 *   subject is another plugin's page and renders nothing);
 * - the checkbox always reports the status document — no optimistic flip —
 *   because a successful save reloads this plugin;
 * - the write goes to the probe route with the document's probe key and
 *   requires `state: 'updated'` before it counts as saved;
 * - `setBalanceQuickViewAvailable` presence is the capability signal: a host
 *   without a persistence channel keeps the switch hidden.
 */

describe('Detail-page balance quick-view switch', () => {
  let view: ReactTestRenderer | undefined
  let statusBody: Record<string, unknown>
  const request = vi.fn()
  const t: WorkBuddyQuickViewSectionProps['t'] = (key, params = {}) =>
    Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), en[key] as string)
  const subject = { kind: 'bundle', pkg: { name: 'dsh-workbuddy-connect', installed: true, availability: 'installed', official: false, enabled: true, rows: [] } } as unknown as WorkBuddyQuickViewSectionProps['subject']

  function signedIn(overrides: Record<string, unknown> = {}): void {
    statusBody = {
      status: 'signed-in',
      probeKey: 'test-key',
      showBalanceQuickView: true,
      setBalanceQuickViewAvailable: true,
      ...overrides,
    }
  }

  beforeEach(() => {
    signedIn()
    request.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return { ok: true, json: async () => statusBody }
      // A successful write lands in the document, the way the host does.
      const written = JSON.parse(String(init.body)) as { enabled: boolean }
      statusBody['showBalanceQuickView'] = written.enabled
      return { ok: true, json: async () => ({ state: 'updated' }) }
    })
    vi.stubGlobal('fetch', request)
  })
  afterEach(() => {
    act(() => view?.unmount())
    vi.unstubAllGlobals()
  })

  async function mount(props: Partial<WorkBuddyQuickViewSectionProps> = {}) {
    await act(async () => { view = create(createElement(WorkBuddyQuickViewSection, { subject, t, ...props })) })
  }

  const checkbox = () => view!.root.findAllByType('input').find(node => node.props['type'] === 'checkbox')
  const posts = () => request.mock.calls.filter(([, init]) => init?.method === 'POST')

  it('renders nothing for another plugin or a non-bundle subject', async () => {
    await mount({ subject: { kind: 'bundle', pkg: { name: 'dsh-other-plugin', installed: true, availability: 'installed', official: false, enabled: true, rows: [] } } as unknown as WorkBuddyQuickViewSectionProps['subject'] })
    expect(view!.toJSON()).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('renders the switch reflecting the document, checked when on', async () => {
    await mount()
    expect(checkbox()).toBeDefined()
    expect(checkbox()!.props['checked']).toBe(true)
    expect(view!.root.findByType('h3').children.join('')).toBe(en.quickViewHeading)
  })

  it('renders the switch unchecked when the preference is off', async () => {
    signedIn({ showBalanceQuickView: false })
    await mount()
    expect(checkbox()!.props['checked']).toBe(false)
  })

  it('posts the new preference to the probe route on toggle', async () => {
    await mount()
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(posts()).toHaveLength(1)
    const [url, init] = posts()[0] as [string, RequestInit]
    expect(url).toBe('/plugins/dsh-workbuddy-connect/probe')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'set-balance-quick-view', enabled: false })
    expect((init.headers as Record<string, string>)['X-Workbuddy-Probe-Key']).toBe('test-key')
    // The checkbox settles on the refreshed document, not on the click.
    expect(checkbox()!.props['checked']).toBe(false)
  })

  it('surfaces a failed save instead of flipping the checkbox', async () => {
    request.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return { ok: true, json: async () => statusBody }
      return { ok: false, status: 404, json: async () => ({ error: 'balance-quick-view-setting-not-supported' }) }
    })
    await mount()
    await act(async () => { checkbox()!.props['onChange']({ currentTarget: { checked: false } }) })
    expect(checkbox()!.props['checked']).toBe(true)
    expect(view!.root.findByType('p').children.join(''))
      .toBe(en.quickViewSaveFailed.replace('{message}', 'balance-quick-view-setting-not-supported'))
  })

  it('hides the switch when the host declares no persistence channel', async () => {
    signedIn({ setBalanceQuickViewAvailable: false })
    await mount()
    // Older-host document without the field: same outcome.
    signedIn({ setBalanceQuickViewAvailable: undefined })
    await mount()
    expect(checkbox()).toBeUndefined()
  })

  it('renders nothing while signed out', async () => {
    statusBody = { status: 'signed-out' }
    await mount()
    expect(view!.toJSON()).toBeNull()
  })
})
