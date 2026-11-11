/**
 * Draws the Graveyard_Scene pieces from `buildGraveyard()` as meshes.
 *
 * Lit pieces use MeshLambertMaterial, the moon and its glow MeshBasicMaterial
 * with fog off. No piece casts or receives shadows (Requirement 5.3). Colours
 * are token values carried by each piece (Requirement 5.5).
 *
 * R3F disposes the materials it creates here; the geometries come from
 * `buildGraveyard()`, so this component disposes them itself on unmount
 * (Requirement 5.8).
 */
import { useEffect, useMemo } from 'react';

import { buildGraveyard } from './graveyard-geometry';

export function Graveyard() {
  const pieces = useMemo(() => buildGraveyard(), []);

  useEffect(
    () => () => {
      for (const piece of pieces) piece.geometry.dispose();
    },
    [pieces],
  );

  return (
    <>
      {pieces.map((piece, index) => {
        const transparent = piece.opacity < 1;
        return (
          <mesh
            key={`${piece.role}-${index}`}
            geometry={piece.geometry}
            position={[piece.position[0], piece.position[1], piece.position[2]]}
            rotation-y={piece.rotationY}
          >
            {piece.lit ? (
              <meshLambertMaterial
                color={piece.color}
                fog={piece.fog}
                transparent={transparent}
                opacity={piece.opacity}
              />
            ) : (
              <meshBasicMaterial
                color={piece.color}
                fog={piece.fog}
                transparent={transparent}
                opacity={piece.opacity}
              />
            )}
          </mesh>
        );
      })}
    </>
  );
}
