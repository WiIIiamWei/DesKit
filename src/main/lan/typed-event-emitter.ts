import { EventEmitter } from "node:events"

/**
 * Thin wrapper over Node's EventEmitter that constrains event names and their
 * argument tuples to a typed map, so producers and consumers cannot drift on
 * event names or payload shapes. The constraint is written as
 * `Record<keyof TEvents, unknown[]>` so plain interfaces (which lack an index
 * signature) are accepted as event maps.
 */
export class TypedEventEmitter<
  TEvents extends Record<keyof TEvents, unknown[]>,
> extends EventEmitter {
  override emit<K extends keyof TEvents & (string | symbol)>(
    event: K,
    ...args: TEvents[K]
  ): boolean {
    return super.emit(event, ...args)
  }

  override on<K extends keyof TEvents & (string | symbol)>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void)
  }

  override once<K extends keyof TEvents & (string | symbol)>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void)
  }

  override off<K extends keyof TEvents & (string | symbol)>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void)
  }
}
