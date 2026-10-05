import { lazy, Suspense, useState } from "react";
import { hasWebGL, useMediaQuery } from "@/lib/use-media";

const ShaderBackdrop = lazy(() => import("@/components/shader-backdrop"));

/** Static gradient that stands in while three.js loads, and when WebGL is unavailable. */
const fallbackGradient =
  "radial-gradient(60% 90% at 85% 0%, rgba(52,211,153,.30), transparent 70%), radial-gradient(55% 80% at 35% -10%, rgba(5,150,105,.34), transparent 70%)";

export function Backdrop() {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [webgl] = useState(hasWebGL);
  const fallback = <div className="absolute inset-0" style={{ background: fallbackGradient }} />;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] opacity-[0.32] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
    >
      {webgl ? (
        <Suspense fallback={fallback}>
          <ShaderBackdrop animate={!reduceMotion} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
