/**
 * Remove a payment card
 */

import { z } from "zod";
import { removeCard, getCard } from "../lib/cards";

export const name = "remove_card";

export const description = "Remove a saved payment card. This action is irreversible.";

export const parameters = z.object({
  card_id: z.string().describe("ID of the card to remove"),
  confirm: z.boolean().describe("Must be true to confirm deletion"),
});

export async function execute(args: z.infer<typeof parameters>) {
  if (!args.confirm) {
    return {
      success: false,
      error: "You must set confirm=true to delete a card",
    };
  }
  
  const card = await getCard(args.card_id);
  if (!card) {
    return {
      success: false,
      error: "Card not found",
    };
  }
  
  const removed = await removeCard(args.card_id);
  
  if (removed) {
    return {
      success: true,
      message: `Card "${card.nickname}" (****${card.lastFourDigits}) has been removed`,
    };
  } else {
    return {
      success: false,
      error: "Failed to remove card",
    };
  }
}
