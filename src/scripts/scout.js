/* =========================================================
   KIVANTA SCOUT
   FRONT-END INTERACTIONS
========================================================= */

/* =========================================================
   1. MOUSE-INFLUENCED AMBIENT LIGHT
========================================================= */

/*
   The glow does NOT directly follow the cursor.

   Instead:

   Mouse moves
        ↓
   Target position changes
        ↓
   Current glow position slowly moves toward target
        ↓
   Result = soft delayed environmental movement
*/

const root = document.documentElement;

/* ---------------------------------------------------------
   MOTION / DEVICE CHECKS
--------------------------------------------------------- */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const finePointer = window.matchMedia("(pointer: fine)");

/* ---------------------------------------------------------
   GLOW POSITION VALUES
--------------------------------------------------------- */

let targetX = 0;
let targetY = 0;

let currentX = 0;
let currentY = 0;

/* ---------------------------------------------------------
   MOVEMENT STRENGTH

   These values control how far the glow can lean
   toward the mouse.

   Keep them relatively small so the light does not
   feel attached to the cursor.
--------------------------------------------------------- */

const maxMovementX = 90;
const maxMovementY = 65;

/* ---------------------------------------------------------
   SMOOTHING

   Smaller number = slower / softer response.

   0.045 gives the glow a delayed feeling rather than
   instantly following the mouse.
--------------------------------------------------------- */

const smoothing = 0.045;

/* =========================================================
   2. UPDATE TARGET FROM MOUSE
========================================================= */

function handlePointerMove(event) {
  /*
     Disable the effect for:

     - touch/coarse-pointer devices
     - visitors requesting reduced motion
  */

  if (reducedMotion.matches || !finePointer.matches) {
    return;
  }

  /*
     Convert mouse position into a number between:

     -1 and +1
  */

  const normalizedX = (event.clientX / window.innerWidth - 0.5) * 2;

  const normalizedY = (event.clientY / window.innerHeight - 0.5) * 2;

  /*
     Turn normalized mouse position into
     a small glow movement distance.
  */

  targetX = normalizedX * maxMovementX;

  targetY = normalizedY * maxMovementY;
}

/* =========================================================
   3. RETURN GLOW TOWARD CENTER
========================================================= */

function resetGlowPosition() {
  targetX = 0;
  targetY = 0;
}

/* =========================================================
   4. SMOOTH ANIMATION LOOP
========================================================= */

function animateGlow() {
  /*
     Slowly move current position
     toward target position.
  */

  currentX += (targetX - currentX) * smoothing;

  currentY += (targetY - currentY) * smoothing;

  /*
     Send values into CSS variables.
  */

  root.style.setProperty("--mouse-glow-x", `${currentX}px`);

  root.style.setProperty("--mouse-glow-y", `${currentY}px`);

  /*
     Continue animation.
  */

  requestAnimationFrame(animateGlow);
}

/* =========================================================
   5. EVENT LISTENERS
========================================================= */

window.addEventListener("pointermove", handlePointerMove, { passive: true });

/*
   When the mouse leaves the browser window,
   slowly return the glow toward its natural position.
*/

document.documentElement.addEventListener("mouseleave", resetGlowPosition);

/* =========================================================
   6. ACCESSIBILITY / DEVICE CHANGES
========================================================= */

function handleMotionPreferenceChange() {
  if (reducedMotion.matches || !finePointer.matches) {
    targetX = 0;
    targetY = 0;
  }
}

reducedMotion.addEventListener("change", handleMotionPreferenceChange);

finePointer.addEventListener("change", handleMotionPreferenceChange);

/* =========================================================
   7. START AMBIENT INTERACTION
========================================================= */

animateGlow();
