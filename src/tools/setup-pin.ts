/**
 * Set up master PIN for card access
 */

import { z } from "zod";
import { setupPin, isPinConfigured } from "../lib/pin-manager";

export const name = "setup_pin";

export const description = "Set up a master PIN (4-8 characters) for card access. This PIN encrypts your CVVs and must be entered to unlock cards for payments. Choose something you'll remember!";

export const parameters = z.object({
  pin: z.string().describe("Your master PIN (4-8 characters). This will encrypt your CVVs."),
});

export async function execute(args: z.infer<typeof parameters>) {
  if (isPinConfigured()) {
    return {
      success: false,
      error: "PIN already configured. Use change_pin to modify it.",
    };
  }
  
  const result = setupPin(args.pin);
  
  if (result.success) {
    return {
      success: true,
      message: "Master PIN configured! Cards are now unlocked.",
      note: "Your PIN encrypts all CVVs. Without it, cards cannot be used.",
      session_timeout: "30 minutes of inactivity will lock cards automatically",
    };
  } else {
    return {
      success: false,
      error: result.error,
    };
  }
}
