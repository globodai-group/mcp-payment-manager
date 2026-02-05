/**
 * Unlock cards with master PIN
 */

import { z } from "zod";
import { unlock, isPinConfigured, getStatus } from "../lib/pin-manager";

export const name = "unlock_cards";

export const description = "Unlock your cards by entering your master PIN. Required before making any payment. Cards stay unlocked for 30 minutes of activity.";

export const parameters = z.object({
  pin: z.string().describe("Your master PIN"),
});

export async function execute(args: z.infer<typeof parameters>) {
  if (!isPinConfigured()) {
    return {
      success: false,
      error: "No PIN configured. Use setup_pin first.",
    };
  }
  
  const status = getStatus();
  if (status.unlocked) {
    return {
      success: true,
      message: "Cards already unlocked",
      remaining_minutes: status.remainingMinutes,
    };
  }
  
  const result = unlock(args.pin);
  
  if (result.success) {
    return {
      success: true,
      message: "Cards unlocked! You can now make payments.",
      session_expires_in: `${result.expiresIn} minutes`,
      tip: "Cards will auto-lock after 30 minutes of inactivity",
    };
  } else {
    return {
      success: false,
      error: result.error,
    };
  }
}
