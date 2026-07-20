"use client";

import { useEffect } from "react";
import { motion, stagger, useAnimate } from "motion/react";

import Floating, { FloatingElement } from "@/components/ui/parallax-floating";

// Warm "family scrapbook" polaroid frames — cream mats, gentle sepia on the
// B&W source photos, and a soft warm lift shadow instead of the old dim look.
const frameClass =
  "bg-cream p-2 pb-6 shadow-[0_1.25rem_3rem_rgba(158,70,38,0.22)] ring-1 ring-line rounded-md";
const photoClass =
  "object-cover sepia-[0.32] contrast-[1.02] brightness-[1.03] rounded-[3px]";

export function LandingParallaxPhotos() {
  const [scope, animate] = useAnimate();

  useEffect(() => {
    animate(
      "img",
      { opacity: [0, 1] },
      { duration: 0.7, delay: stagger(0.12, { startDelay: 0.25 }) }
    );
  }, [animate]);

  return (
    <div
      ref={scope}
      className="pointer-events-none absolute inset-0 z-[1] hidden overflow-hidden lg:block"
      aria-hidden="true"
    >
      <Floating sensitivity={-0.65} className="overflow-hidden">
        <FloatingElement depth={0.7} className="left-[11%] top-[17%]">
          <div className={`${frameClass} -rotate-5`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
              src="/fishing.jpg"
              alt=""
              className={`${photoClass} h-32 w-52 md:h-[10.5rem] md:w-[16.5rem]`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={1.4} className="left-[33%] top-[13%]">
          <div className={`${frameClass} rotate-2`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
              src="/oldschool.webp"
              alt=""
              className={`${photoClass} h-16 w-28 md:h-20 md:w-36`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={2.2} className="right-[14%] top-[8%]">
          <div className={`${frameClass} rotate-5`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              src="/oldsoccer.jpg"
              alt=""
              className={`${photoClass} h-52 w-36 md:h-72 md:w-52`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={0.9} className="right-[12%] top-[36%]">
          <div className={`${frameClass} -rotate-3`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, 7, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              src="/oldbasketball.jpg"
              alt=""
              className={`${photoClass} h-20 w-20 md:h-24 md:w-24`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={1.8} className="left-[12%] bottom-[12%]">
          <div className={`${frameClass} rotate-3`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 8.8, repeat: Infinity, ease: "easeInOut" }}
              src="/oldrandom.jpg"
              alt=""
              className={`${photoClass} h-[8.5rem] w-56 md:h-[11rem] md:w-[18rem]`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={2.7} className="left-[21%] bottom-[7%]">
          <div className={`${frameClass} -rotate-4`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 7.8, repeat: Infinity, ease: "easeInOut" }}
              src="/oldkids.jpg"
              alt=""
              className={`${photoClass} h-28 w-28 md:h-36 md:w-36`}
            />
          </div>
        </FloatingElement>

        <FloatingElement depth={1.2} className="right-[15%] bottom-[13%]">
          <div className={`${frameClass} rotate-4`}>
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 8.2, repeat: Infinity, ease: "easeInOut" }}
              src="/oldcar.webp"
              alt=""
              className={`${photoClass} h-16 w-28 md:h-20 md:w-36`}
            />
          </div>
        </FloatingElement>
      </Floating>
    </div>
  );
}
