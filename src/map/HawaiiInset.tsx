import { useMemo } from 'react';
import { geoPath } from 'd3-geo';
import type { RegionAssignment } from '../config/territories';
import { HAWAII, hawaiiProjection, type Boundaries } from './geo';

interface Props {
  boundaries: Boundaries;
  index: Map<string, RegionAssignment>;
}

const W = 150;
const H = 86;

/** Hawaii sits in its own box, as the reference map leaves it off. */
export function HawaiiInset({ boundaries, index }: Props) {
  const hawaii = boundaries.regions.find((r) => r.properties.code === HAWAII);
  const d = useMemo(() => (hawaii ? geoPath(hawaiiProjection(W, H))(hawaii) ?? '' : ''), [hawaii]);
  if (!hawaii) return null;
  const a = index.get(HAWAII);
  return (
    <figure className="inset">
      <svg width={W} height={H} role="img" aria-label={`Hawaii: ${a ? a.territory.name : 'unassigned'}`}>
        <path
          d={d}
          className={`region${a ? '' : ' unassigned'}`}
          style={a ? { fill: a.territory.color } : undefined}
        />
      </svg>
      <figcaption>
        Hawaii <span className="muted">{a ? a.territory.name : 'unassigned'}</span>
      </figcaption>
    </figure>
  );
}
