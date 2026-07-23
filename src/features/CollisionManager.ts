import type { ComponentEntity } from '../core/ComponentEntity';
import type { ComponentRegistry } from '../core/Registry';

export interface KeepOutViolation {
  ownerId: string;
  keepOutId: string;
  keepOutLabel: string;
  intruderId: string;
}

export interface CollisionReport {
  pairs: Array<[string, string]>;
  collidingIds: ReadonlySet<string>;
  keepOutViolations: KeepOutViolation[];
}

/**
 * Features 9-11: axis-aligned bounding-box collision detection between
 * components, plus service-clearance / connector keep-out intrusion checks.
 *
 * Structure and enclosure components are excluded from pair checks by design:
 * every internal component legitimately sits inside the chassis/enclosure
 * envelope, so those AABB overlaps carry no information.
 */
export class CollisionManager {
  constructor(private readonly registry: ComponentRegistry) {}

  private candidates(): ComponentEntity[] {
    return this.registry.entities.filter(
      (e) => e.effectiveVisible() && !e.record.isEnclosure && e.record.category !== 'structure'
    );
  }

  update(): CollisionReport {
    const list = this.candidates();
    const pairs: Array<[string, string]> = [];
    const colliding = new Set<string>();

    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!b) continue;
        if (a.baseAabb.isEmpty() || b.baseAabb.isEmpty()) continue;
        if (a.baseAabb.intersectsBox(b.baseAabb)) {
          pairs.push([a.id, b.id]);
          colliding.add(a.id);
          colliding.add(b.id);
        }
      }
    }

    // Keep-out intrusion checks include structure (a bulkhead inside a service
    // clearance is a real interference); only enclosure shells are exempt,
    // since their volume legitimately contains everything. Checks run against
    // per-primitive boxes so a frame's union AABB (which spans the empty bay
    // between its rails) does not create false violations.
    const intruders = this.registry.entities.filter(
      (e) => e.effectiveVisible() && !e.record.isEnclosure
    );
    const partBoxes = new Map(intruders.map((e) => [e.id, e.getBasePartBoxes()]));

    const keepOutViolations: KeepOutViolation[] = [];
    for (const owner of this.registry.entities) {
      if (!owner.effectiveVisible() || owner.record.keepOuts.length === 0) continue;
      const violatedIds = new Set<string>();
      for (const ko of owner.record.keepOuts) {
        const koBox = owner.getKeepOutWorldBox(ko);
        for (const other of intruders) {
          if (other.id === owner.id) continue;
          const parts = partBoxes.get(other.id);
          if (!parts || parts.length === 0) continue;
          if (parts.some((b) => koBox.intersectsBox(b))) {
            violatedIds.add(ko.id);
            keepOutViolations.push({
              ownerId: owner.id,
              keepOutId: ko.id,
              keepOutLabel: ko.label,
              intruderId: other.id
            });
          }
        }
      }
      owner.setKeepOutViolations(violatedIds);
    }

    for (const entity of this.registry.entities) {
      const now = colliding.has(entity.id);
      if (now !== entity.colliding) {
        entity.colliding = now;
        entity.refreshHighlight();
      }
    }

    return { pairs, collidingIds: colliding, keepOutViolations };
  }
}
