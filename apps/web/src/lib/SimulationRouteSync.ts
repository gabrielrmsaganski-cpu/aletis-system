export interface SimulationRouteTarget { clientId: string; workspaceId?: string }

const routeKey = (target: SimulationRouteTarget) => JSON.stringify([target.clientId, target.workspaceId || ''])

/** Distingue uma navegação efetivamente confirmada do render anterior durante startTransition. */
export class SimulationRouteSync {
  private locationKey: string
  private observed: SimulationRouteTarget
  private activeLoad: SimulationRouteTarget | null = null
  private internalNavigation: SimulationRouteTarget | null = null
  private queuedExternal: SimulationRouteTarget | null = null

  constructor(locationKey: string, initial: SimulationRouteTarget) {
    this.locationKey = locationKey
    this.observed = initial
  }

  beginLoad(target: SimulationRouteTarget): void { this.activeLoad = target }
  cancelLoad(): void { this.activeLoad = null }

  /** Uma navegação externa ocorrida durante a leitura tem preferência sobre o término da ação anterior. */
  finishLoad(target: SimulationRouteTarget): boolean {
    this.activeLoad = null
    if (this.queuedExternal && routeKey(this.queuedExternal) !== routeKey(target)) return false
    this.queuedExternal = null
    this.internalNavigation = target
    return true
  }

  observe(locationKey: string, target: SimulationRouteTarget, busy: boolean): SimulationRouteTarget | null {
    if (locationKey !== this.locationKey) {
      const previous = this.observed
      this.locationKey = locationKey
      this.observed = target
      if (this.internalNavigation && routeKey(this.internalNavigation) === routeKey(target)) {
        this.internalNavigation = null
        this.queuedExternal = null
        return null
      }
      const interrupted = this.activeLoad || this.internalNavigation
      this.internalNavigation = null
      if (routeKey(previous) !== routeKey(target) || (interrupted && routeKey(interrupted) !== routeKey(target))) {
        this.queuedExternal = target
      }
    }
    if (busy || !this.queuedExternal) return null
    const requested = this.queuedExternal
    this.queuedExternal = null
    return requested
  }
}
