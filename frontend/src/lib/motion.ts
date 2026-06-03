import { useReducedMotion } from "framer-motion"

/** Chat message appear: opacity 0→1, y +8→0, 150ms ease-out */
export const chatMessageVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

export const chatMessageTransition = { duration: 0.15, ease: "easeOut" as const }

/** Panel open/close: width animation handled in component; spring for modals */
export const panelTransition = { duration: 0.2, ease: "easeInOut" as const }

export const upgradeModalVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
}

export const upgradeModalTransition = { type: "spring" as const, stiffness: 400, damping: 28 }

export function useMotionSafe() {
  const reduced = useReducedMotion()
  return {
    reduced: Boolean(reduced),
    initial: reduced ? false : "hidden",
    animate: reduced ? undefined : "visible",
  }
}
