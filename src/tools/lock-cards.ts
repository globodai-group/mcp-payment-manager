/**
 * Lock cards (clear PIN from memory)
 */

import { z } from "zod";
import { lock, getStatus } from "../lib/pin-manager";

export const name = "lock_cards";

export const description = "Lock your cards immediately. Clears the PIN from memory. You'll need to unlock again to make payments.";

export const parameters = z.object({});

export async function execute(_args: z.infer<typeof parameters>) {
  const status = getStatus();
  
  if (!status.unlocked) {
    return {
      success: true,
      message: "Cards are already locked",
    };
  }
  
  lock();
  
  return {
    success: true,
    message: "Cards locked. PIN cleared from memory.",
    note: "Use unlock_cards to unlock again when needed.",
  };
}
