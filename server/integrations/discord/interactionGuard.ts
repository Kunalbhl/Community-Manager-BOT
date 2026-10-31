import type { Interaction, RepliableInteraction } from 'discord.js';
import { logger } from '../../logging/logger.js';

/**
 * Discord requires an initial response within 3 seconds. Our handlers do database work
 * before replying, which can exceed that on a cold start or a slow network.
 *
 * guardInteraction() starts a timer: if the handler has not replied after AUTO_DEFER_MS,
 * the interaction is deferred automatically, and reply() is transparently rerouted to
 * editReply() so existing command code keeps working unchanged.
 */
const AUTO_DEFER_MS = 2000;

export function guardInteraction(interaction: Interaction): () => void {
  if (!interaction.isRepliable()) return () => {};
  const i = interaction as RepliableInteraction & { reply: any };
  const originalReply = i.reply.bind(i);
  let deferring: Promise<unknown> | null = null;

  const timer = setTimeout(() => {
    if (i.replied || i.deferred) return;
    deferring = i.deferReply({ ephemeral: true }).catch((err: any) => {
      logger.warn(`[InteractionGuard] Auto-defer failed: ${err?.message}`);
    });
  }, AUTO_DEFER_MS);

  i.reply = async (options: any) => {
    clearTimeout(timer);
    if (deferring) await deferring;
    if (i.deferred && !i.replied) {
      const { ephemeral, flags, fetchReply, ...rest } = typeof options === 'string' ? { content: options } as any : options || {};
      return i.editReply(rest);
    }
    if (i.replied) {
      return i.followUp(options);
    }
    return originalReply(options);
  };

  return () => clearTimeout(timer);
}

/** Sends a safe error message whatever state the interaction is in. Never throws. */
export async function replyWithError(interaction: Interaction, message: string): Promise<void> {
  if (!interaction.isRepliable()) return;
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: message });
    } else if (interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  } catch (err: any) {
    logger.warn(`[InteractionGuard] Could not send error reply: ${err?.message}`);
  }
}
