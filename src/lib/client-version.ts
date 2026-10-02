/** Increment for each release that changes the minimum supported JS protocol.
 * This is a compatibility marker, never proof of identity or binary integrity.
 */
export const HOS_CLIENT_PROTOCOL = 2;

const listeners = new Set<() => void>();
export function subscribeToRequiredUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function reportRequiredUpdate(): void {
  for (const listener of listeners) listener();
}
