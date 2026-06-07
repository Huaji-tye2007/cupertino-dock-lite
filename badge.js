// badge.js — clone badge renderer, delegates count to D2D's notificationsMonitor
import Clutter from 'gi://Clutter';

export class BadgeManager {
  constructor() {
    this._icons = new Set();
    this._notificationsMonitor = null;
    this._monitorChangedId = null;
  }

  // Called by animator.js once D2D is ready.
  setNotificationsMonitor(monitor) {
    if (this._monitorChangedId && this._notificationsMonitor) {
      this._notificationsMonitor.disconnect(this._monitorChangedId);
      this._monitorChangedId = null;
    }
    this._notificationsMonitor = monitor;
    if (monitor) {
      try {
        this._monitorChangedId = monitor.connect('changed', () => {
          this._icons.forEach(uiIcon => { try { this._applyBadge(uiIcon); } catch (e) { } });
          try { this.onRebuild?.(); } catch (e) { }
        });
      } catch (e) { }
    }
    this._icons.forEach(uiIcon => { try { this._applyBadge(uiIcon); } catch (e) { } });
    try { this.onRebuild?.(); } catch (e) { }
  }

  _getCount(appId) {
    if (!appId || !this._notificationsMonitor) return 0;
    try { return this._notificationsMonitor.getAppNotificationsCount(appId) ?? 0; } catch (e) { return 0; }
  }

  destroy() {
    if (this._monitorChangedId && this._notificationsMonitor) {
      this._notificationsMonitor.disconnect(this._monitorChangedId);
    }
    this._monitorChangedId = null;
    this._notificationsMonitor = null;
    this._icons.clear();
  }

  _applyBadge(uiIcon, countOverride = null, cloneActive = false) {
    const badge = uiIcon._badge;
    if (!badge || !badge._geometryReady) return;
    const appId = uiIcon._appwell?.app?.get_id() ?? null;
    const count = countOverride ?? this._getCount(appId);
    const show = cloneActive && count > 0;

    badge.visible = show;
  }

  attachToIcon(uiIcon) {
    try {
      const badge = new Clutter.Clone({
        name: 'cupertinisator-badge-container',
        visible: false,
        reactive: false,
      });

      badge._geometryReady = false;
      badge.set_pivot_point(0, 0);

      uiIcon.add_child(badge);
      uiIcon._badge = badge;
      this._icons.add(uiIcon);
    } catch (e) { }
  }

  updateIcon(uiIcon, iconSize, countOverride = null, cloneActive = false) {
    try {
      const badge = uiIcon._badge;
      if (!badge) return;

      const appId = uiIcon._appwell?.app?.get_id() ?? null;
      const count = countOverride ?? this._getCount(appId);
      const shouldShow = cloneActive && count > 0;

      this._positionLikeD2d(uiIcon, badge, iconSize);

      badge._geometryReady = true;
      badge.visible = shouldShow;
    } catch (e) { }
  }

  _positionLikeD2d(uiIcon, badge, iconSize) {
    const d2dBadge = this._getD2dBadgeActor(uiIcon._appwell);
    const badgeBin = this._getD2dBadgeBin(uiIcon._appwell);
    if (d2dBadge && uiIcon._bin) {
      try {
        const badgeSize = this._getTransformedSize(d2dBadge) || [0, 0];
        const lastBadgeSize = badge._lastBadgeSize || [0, 0];

        const needsUpdate = !badge._cachedOffsetReady ||
                            badge._lastIconSize !== iconSize ||
                            lastBadgeSize[0] !== badgeSize[0] ||
                            lastBadgeSize[1] !== badgeSize[1];

        if (needsUpdate) {
          const oldTx = badgeBin ? badgeBin.translation_x : 0;
          if (badgeBin) badgeBin.translation_x = 0;

          const badgePos = d2dBadge.get_transformed_position();
          const iconPos = uiIcon._bin.get_transformed_position();

          if (badgeBin) badgeBin.translation_x = oldTx;

          badge._cachedX = Math.round(badgePos[0] - iconPos[0]);
          badge._cachedY = Math.round(badgePos[1] - iconPos[1]);
          badge._cachedWidth = Math.round(badgeSize[0]);
          badge._cachedHeight = Math.round(badgeSize[1]);
          badge._cachedOffsetReady = true;
          badge._lastIconSize = iconSize;
          badge._lastBadgeSize = badgeSize;

          badge.source = d2dBadge;
          badge.x = badge._cachedX;
          badge.y = badge._cachedY;
          if (badgeSize[0] > 0 && badgeSize[1] > 0) {
            badge.set_size(badge._cachedWidth, badge._cachedHeight);
            badge.set_scale(1, 1);
          }
        }
        return;
      } catch (e) { }
    }

    const fallback = Math.round(Math.max(16, iconSize * 0.42));
    if (!badge._cachedOffsetReady || badge._lastIconSize !== iconSize || badge.source !== null) {
      badge.source = null;
      badge.set_size(fallback, fallback);
      badge.set_scale(1, 1);
      badge.x = Math.round(uiIcon.width - fallback * 0.72);
      badge.y = Math.round(-fallback * 0.28);
      badge._cachedOffsetReady = true;
      badge._lastIconSize = iconSize;
      badge._lastBadgeSize = [fallback, fallback];
    }
  }

  _getTransformedSize(actor) {
    try {
      const size = actor.get_transformed_size?.();
      if (size && size[0] > 0 && size[1] > 0) return size;
    } catch (e) { }

    try {
      const width = actor.width;
      const height = actor.height;
      if (width > 0 && height > 0) return [width, height];
    } catch (e) { }

    return null;
  }

  _getD2dBadgeActor(appwell) {
    const badgeBin = this._getD2dBadgeBin(appwell);
    if (!badgeBin) return null;
    return this._findStyledBadgeActor(badgeBin) ?? badgeBin;
  }

  _getD2dBadgeBin(appwell) {
    try {
      const container = appwell?._iconContainer;
      if (!container) return null;
      if (container._notificationBadgeBin) return container._notificationBadgeBin;

      const badgeBin = container.get_children?.().find(child =>
        child.get_children?.()?.some?.(c => c.has_style_class_name?.('notification-badge'))
      ) ?? null;
      if (badgeBin) {
        container._notificationBadgeBin = badgeBin;
      }
      return badgeBin;
    } catch (e) {
      return null;
    }
  }

  _findStyledBadgeActor(actor) {
    try {
      if (actor.has_style_class_name?.('notification-badge')) return actor;

      const children = actor.get_children?.() ?? [];
      for (let i = 0; i < children.length; i++) {
        const found = this._findStyledBadgeActor(children[i]);
        if (found) return found;
      }
    } catch (e) { }

    return null;
  }
}
