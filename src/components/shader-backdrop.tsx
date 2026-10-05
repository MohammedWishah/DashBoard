import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

/**
 * Ambient header band rendered with ShaderGradient (react-three-fiber under the hood).
 * Colors are the emerald accent pair, sunk into the page background.
 * Loaded lazily so three.js never blocks the first paint.
 */
export default function ShaderBackdrop({ animate }: { animate: boolean }) {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0 }}
      pixelDensity={1}
      fov={45}
      pointerEvents="none"
      powerPreference="low-power"
      lazyLoad={false}
    >
      <ShaderGradient
        control="props"
        type="waterPlane"
        animate={animate ? "on" : "off"}
        uTime={4}
        uSpeed={0.06}
        uStrength={1.6}
        uDensity={1.1}
        uFrequency={5.5}
        uAmplitude={0}
        positionX={0}
        positionY={0.6}
        positionZ={0}
        rotationX={0}
        rotationY={0}
        rotationZ={225}
        color1="#059669"
        color2="#34d399"
        color3="#0b0b0c"
        reflection={0.1}
        cAzimuthAngle={180}
        cPolarAngle={80}
        cDistance={2.8}
        cameraZoom={9.1}
        lightType="3d"
        brightness={0.9}
        grain="on"
        grainBlending={0.3}
      />
    </ShaderGradientCanvas>
  );
}
