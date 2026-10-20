/**
 * Unit tests for the config-editor entry resolution.
 *
 * The rule under test is identity by loader entry, never by package name: a
 * profile may load this plugin several times, and writing the preference into
 * whichever instance the editor happened to list first would be a silent
 * cross-instance write.
 */

import { describe, expect, it } from 'vitest'
import {
  configEditorOf,
  ownLoaderEntryId,
  resolveConfigEditorEntry,
  WORKBUDDY_ENTRY_SPECIFIER,
  type ConfigEditorEntryView,
} from '../src/config-editor.ts'

const entry = (id: unknown, name: unknown, config: unknown = {}): ConfigEditorEntryView => ({
  options: { id, name, config },
})

describe('resolveConfigEditorEntry', () => {
  it('finds the exact entry id the loader gave this instance', () => {
    const own = entry('my-workbuddy', 'dsh-workbuddy-connect')
    const entries = [entry('llm-deepseek', 'dsh-llm-deepseek'), own]
    expect(resolveConfigEditorEntry(entries, 'my-workbuddy', WORKBUDDY_ENTRY_SPECIFIER)).toBe(own)
  })

  it('writes only its own instance when the package is loaded several times', () => {
    const first = entry('workbuddy-a', 'dsh-workbuddy-connect', { showBalanceQuickView: true })
    const second = entry('workbuddy-b', 'dsh-workbuddy-connect', { showBalanceQuickView: false })
    const entries = [first, second]
    expect(resolveConfigEditorEntry(entries, 'workbuddy-b', WORKBUDDY_ENTRY_SPECIFIER)).toBe(second)
    expect(resolveConfigEditorEntry(entries, 'workbuddy-a', WORKBUDDY_ENTRY_SPECIFIER)).toBe(first)
  })

  it('resolves a nested entry by its custom id rather than its specifier', () => {
    const nested = entry('group/settings/custom-name', 'github:SternChiri/dsh-workbuddy-connect#abc123')
    const entries = [entry('unrelated', 'dsh-other-plugin'), nested]
    expect(resolveConfigEditorEntry(entries, 'group/settings/custom-name', WORKBUDDY_ENTRY_SPECIFIER)).toBe(nested)
  })

  it('answers undefined when the own id is not served, never adopting a neighbour', () => {
    const neighbour = entry('workbuddy-a', 'dsh-workbuddy-connect')
    expect(resolveConfigEditorEntry([neighbour], 'workbuddy-b', WORKBUDDY_ENTRY_SPECIFIER)).toBeUndefined()
  })

  it('treats a specifier match as ambiguous when two entries share it', () => {
    const entries = [
      entry(undefined, 'dsh-workbuddy-connect'),
      entry(undefined, 'dsh-workbuddy-connect'),
    ]
    expect(resolveConfigEditorEntry(entries, undefined, WORKBUDDY_ENTRY_SPECIFIER)).toBeUndefined()
  })

  it('accepts a single specifier match when the host exposed no id', () => {
    const only = entry(undefined, 'dsh-workbuddy-connect')
    const entries = [entry('other', 'dsh-other-plugin'), only]
    expect(resolveConfigEditorEntry(entries, undefined, WORKBUDDY_ENTRY_SPECIFIER)).toBe(only)
  })

  it('answers undefined without an id and without a specifier', () => {
    expect(resolveConfigEditorEntry([entry(null, 'dsh-workbuddy-connect')], undefined, undefined)).toBeUndefined()
  })
})

describe('ownLoaderEntryId', () => {
  it('reads the id off the running fiber', () => {
    expect(ownLoaderEntryId({ fiber: { entry: { options: { id: 'workbuddy-a' } } } })).toBe('workbuddy-a')
  })

  it('answers undefined for a missing, empty, or non-string id', () => {
    expect(ownLoaderEntryId(undefined)).toBeUndefined()
    expect(ownLoaderEntryId({})).toBeUndefined()
    expect(ownLoaderEntryId({ fiber: {} })).toBeUndefined()
    expect(ownLoaderEntryId({ fiber: { entry: { options: { id: '' } } } })).toBeUndefined()
    expect(ownLoaderEntryId({ fiber: { entry: { options: { id: 7 } } } })).toBeUndefined()
  })
})

describe('configEditorOf', () => {
  it('requires both members before reporting the service', () => {
    const entries = (): ConfigEditorEntryView[] => []
    const edit = async (): Promise<void> => {}
    expect(configEditorOf({ entries, edit })).toBeDefined()
    expect(configEditorOf({ entries })).toBeUndefined()
    expect(configEditorOf({ edit })).toBeUndefined()
    expect(configEditorOf(undefined)).toBeUndefined()
    expect(configEditorOf(null)).toBeUndefined()
  })
})
