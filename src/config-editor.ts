/**
 * The DSH 0.2.x config-editor service, detected at runtime.
 *
 * Since 0.2.0 the host persists plugin configuration through a dedicated
 * host-side service (`configEditor`): it owns the profile patch documents and
 * reconciles a reload after each write. The service is not part of this
 * plugin's dependency tree — the peer range pins the core, but the editor
 * ships with the host runtime and older cores simply lack it — so depending
 * on its types would couple the build to a package the plugin cannot name.
 *
 * The same situation the 0.1.x `legacy-settings` detection survives, solved
 * the same way: a local structural view of only the two members this plugin
 * drives (`entries` to find its own loader entry, `edit` to persist one
 * config field), narrowed from an `unknown`-typed value. A host without the
 * service reports `undefined`, and the quick-view switch degrades to hidden
 * rather than throwing mid-inject.
 *
 * @module dsh-workbuddy-connect/config-editor
 */

/**
 * The slice of the loader entry the editor hands back. `name` is the module
 * specifier the entry was loaded from, which embeds the package name however
 * the profile spells it; `options.id` is the identifier the profile gave this
 * entry, which is what tells two instances of the same package apart;
 * `options.config` is the raw config the entry runs with.
 */
export interface ConfigEditorEntryView {
  options: {
    id?: unknown
    name?: unknown
    config?: unknown
  }
}

/**
 * The two members of the 0.2.x config editor this plugin drives. Deliberately
 * narrower than the real service: `entries` and `edit` are all a one-field
 * config write needs.
 */
export interface ConfigEditorApi {
  entries(): ConfigEditorEntryView[]
  edit(
    entry: ConfigEditorEntryView,
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void>
}

/**
 * The npm package name this plugin is published under. Loader entries name
 * their module by specifier, which for an installed profile is this package
 * (or a path whose last segment is it).
 */
export const WORKBUDDY_ENTRY_SPECIFIER = 'dsh-workbuddy-connect'

/**
 * This plugin instance's own loader entry id, read from the cordis fiber it
 * runs on.
 *
 * The loader keys entries by the id the profile gave them, and the fiber's
 * entry is the one currently loading — so this is identity by construction,
 * not by matching a name. `undefined` on a host that does not expose the
 * entry (a programmatic composition, or a core without the accessor), which
 * makes the caller fall back to an unambiguous specifier match.
 *
 * @param ctx - the plugin context whose fiber is looked up.
 */
export function ownLoaderEntryId(ctx: unknown): string | undefined {
  const fiber = (ctx as { fiber?: { entry?: { options?: { id?: unknown } } } } | undefined)?.fiber
  const id = fiber?.entry?.options?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/**
 * Pick this plugin's own loader entry out of the editor's list.
 *
 * The profile can load the same package more than once — two instances with
 * different entry ids, an instance nested inside a group, or one renamed to a
 * custom id. Matching on the package name alone would find *an* instance and
 * write the preference into whichever came first, which is a silent
 * cross-instance write. So identity comes from the loader, never from the
 * specifier: the entry this plugin is running as carries the very id the
 * profile gave it, and that id is unique per composition.
 *
 * A host that cannot name this plugin's entry answers `undefined` — never a
 * guess, because a wrong guess silently writes another plugin's configuration.
 *
 * @param entries - the editor's entries, in load order.
 * @param ownEntryId - this plugin's own entry id from the loader, or
 *   `undefined` when the host exposed none to the plugin.
 * @param ownSpecifier - the module specifier this plugin was loaded from, used
 *   only to recognise its own entries when the host exposed no id at all; a
 *   specifier naming several entries stays ambiguous and answers `undefined`.
 */
export function resolveConfigEditorEntry(
  entries: readonly ConfigEditorEntryView[],
  ownEntryId: string | undefined,
  ownSpecifier: string | undefined,
): ConfigEditorEntryView | undefined {
  if (ownEntryId !== undefined) {
    return entries.find(candidate => candidate.options.id === ownEntryId)
  }
  if (ownSpecifier === undefined) return undefined
  const named = entries.filter(candidate => candidate.options.name === ownSpecifier)
  // One match names this plugin unambiguously; several mean the host serves
  // instances it did not identify, and writing to the wrong one is worse than
  // reporting that the preference cannot be saved here.
  return named.length === 1 ? named[0] : undefined
}

/**
 * Narrow one host `configEditor` service to the members this plugin drives,
 * or `undefined` when this host does not carry the service at all.
 *
 * Both members are required: an editor that could list entries but not persist
 * edits would let this plugin surface a switch whose toggles never save, and
 * that is exactly the state the capability signal exists to avoid.
 *
 * @param configEditor - the host service, whose presence is generation-dependent.
 */
export function configEditorOf(configEditor: unknown): ConfigEditorApi | undefined {
  if (typeof configEditor !== 'object' || configEditor === null) return undefined
  const candidate = configEditor as { entries?: unknown; edit?: unknown }
  if (typeof candidate.entries !== 'function') return undefined
  if (typeof candidate.edit !== 'function') return undefined
  return configEditor as unknown as ConfigEditorApi
}
