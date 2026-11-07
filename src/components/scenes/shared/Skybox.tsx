import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import type { Group, PerspectiveCamera } from "three";

import { freezeSubtree } from "../../../utils/freezeSubtree";
import { getCssColorValue } from "../../ui/lib/cssUtils";

const SKYBOX_RADIUS = 100;
const STAR_MIN_SIZE = 0.04;
const STAR_MAX_SIZE = 0.16;
const STAR_DRIFT_SPEED = 0.006;
const TINT_GREEN_FRACTION = 0.35;
const HORIZON_TINT_MIX = 0.025;
const SKY_TINT_MIX = 0.035;

// Shared across every Skybox instance — the geometry never varies per mount.
const skyGeometry = new SphereGeometry(SKYBOX_RADIUS, 32, 32);

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uOverheadColor;
uniform vec3 uHorizonColor;
uniform vec3 uTintColor;

varying vec3 vDirection;

void main() {
  float horizonFactor = pow(1.0 - clamp(vDirection.y, 0.0, 1.0), 2.5);
  vec3 color = mix(uOverheadColor, uHorizonColor, horizonFactor);
  color = mix(color, uTintColor, horizonFactor * ${SKY_TINT_MIX});
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const STAR_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uPointScale;

attribute float aSize;
attribute float aIntensity;
attribute float aPhase;
attribute float aDrift;

varying float vAlpha;

void main() {
  float driftAngle = uTime * ${STAR_DRIFT_SPEED} * aDrift;
  float c = cos(driftAngle);
  float s = sin(driftAngle);
  vec3 drifted = vec3(
    c * position.x - s * position.z,
    position.y,
    s * position.x + c * position.z
  );

  vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
  float twinkle = 0.72 + 0.28 * sin(uTime * (0.8 + aDrift) + aPhase);
  vAlpha = aIntensity * twinkle;
  gl_PointSize = aSize * uPointScale / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;

varying float vAlpha;

void main() {
  float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
  float falloff = 1.0 - smoothstep(0.05, 0.5, distanceFromCenter);
  gl_FragColor = vec4(uColor, vAlpha * falloff);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

type SkyboxProps = {
  starCount?: number;
  baseColor?: string;
  starColor?: string;
  tintColor?: string;
};

export const Skybox: FC<SkyboxProps> = memo(
  ({
    starCount = 450,
    baseColor = getCssColorValue("scene-sky-base"),
    starColor = getCssColorValue("scene-white"),
    tintColor = getCssColorValue("scene-water-emissive"),
  }) => {
    const starGeometry = useMemo(() => {
      const positions = new Float32Array(starCount * 3);
      const sizes = new Float32Array(starCount);
      const intensities = new Float32Array(starCount);
      const phases = new Float32Array(starCount);
      const drifts = new Float32Array(starCount);

      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const radius = SKYBOX_RADIUS * 0.99;

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        sizes[i] =
          STAR_MIN_SIZE + Math.random() * (STAR_MAX_SIZE - STAR_MIN_SIZE);
        intensities[i] = 0.5 + Math.random() * 0.5;
        phases[i] = Math.random() * Math.PI * 2;
        drifts[i] = 0.6 + Math.random() * 0.8;
      }

      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(positions, 3)
      );
      geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
      geometry.setAttribute(
        "aIntensity",
        new Float32BufferAttribute(intensities, 1)
      );
      geometry.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
      geometry.setAttribute("aDrift", new Float32BufferAttribute(drifts, 1));

      return geometry;
    }, [starCount]);

    const skyMaterial = useMemo(() => {
      const base = new Color(baseColor);
      const tint = new Color(tintColor).lerp(
        new Color(getCssColorValue("scene-portal")),
        TINT_GREEN_FRACTION
      );

      return new ShaderMaterial({
        uniforms: {
          uOverheadColor: { value: base.clone().multiplyScalar(0.55) },
          uHorizonColor: {
            value: base.clone().multiplyScalar(2.4).lerp(tint, HORIZON_TINT_MIX),
          },
          uTintColor: { value: tint },
        },
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      });
    }, [baseColor, tintColor]);

    const starMaterial = useMemo(
      () =>
        new ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uPointScale: { value: 1000 },
            uColor: { value: new Color(starColor) },
          },
          vertexShader: STAR_VERTEX_SHADER,
          fragmentShader: STAR_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
        }),
      [starColor]
    );

    useEffect(() => {
      return () => {
        starGeometry.dispose();
        skyMaterial.dispose();
        starMaterial.dispose();
      };
    }, [starGeometry, skyMaterial, starMaterial]);

    useFrame((state) => {
      starMaterial.uniforms.uTime.value = state.clock.elapsedTime;
      starMaterial.uniforms.uPointScale.value =
        (state.size.height * state.gl.getPixelRatio()) /
        (2 *
          Math.tan(
            MathUtils.degToRad((state.camera as PerspectiveCamera).fov) * 0.5
          ));
    });

    const groupRef = useRef<Group>(null);
    useLayoutEffect(() => {
      if (groupRef.current) freezeSubtree(groupRef.current);
    }, [starGeometry]);

    return (
      <group name="skybox" ref={groupRef}>
        <mesh geometry={skyGeometry} material={skyMaterial} renderOrder={-1} />
        <points
          geometry={starGeometry}
          material={starMaterial}
          renderOrder={-1}
        />
      </group>
    );
  }
);

Skybox.displayName = "Skybox";
