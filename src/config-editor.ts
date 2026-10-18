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
 * the profile spells it; `options.config` is the raw config the entry runs
 * with.
 */
export interface ConfigEditorEntryView {
  options: {
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
