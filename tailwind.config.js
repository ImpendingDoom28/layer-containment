import {
  UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC,
  UI_ACTION_DENIED_HUD_SHAKE_ROTATE_DEG,
  UI_ACTION_DENIED_HUD_SHAKE_ROTATE_DEG_KEYFRAME_75_SCALE,
  UI_ACTION_DENIED_HUD_SHAKE_TRANSLATE_PX,
} from "./src/constants/uiActionDeniedFeedback.ts";

const px = UI_ACTION_DENIED_HUD_SHAKE_TRANSLATE_PX;
const deg = UI_ACTION_DENIED_HUD_SHAKE_ROTATE_DEG;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "hud-denied-shake": {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
          "25%": {
            transform: `translate(${px}px, -${px}px) rotate(-${deg}deg)`,
          },
          "50%": {
            transform: `translate(-${px}px, ${px}px) rotate(${deg}deg)`,
          },
          "75%": {
            transform: `translate(${px}px, ${px}px) rotate(-${
              deg * UI_ACTION_DENIED_HUD_SHAKE_ROTATE_DEG_KEYFRAME_75_SCALE
            }deg)`,
          },
        },
      },
      animation: {
        "hud-denied-shake": `hud-denied-shake ${UI_ACTION_DENIED_HUD_SHAKE_DURATION_SEC}s ease-out`,
      },
    },
  },
  plugins: [],
}
