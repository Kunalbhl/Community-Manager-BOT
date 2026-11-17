/**
 * Every channel and category gets a matching emoji that no other channel in the server uses,
 * so the channel list stays easy to scan. Names that already have an emoji are never changed.
 */
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const ALL_EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/** Keyword → emoji choices (best first). Matched against the plain lowercase name. */
const MAP: [RegExp, string[]][] = [
  [/rule|guideline|law/, ['📜', '📖', '⚖️']],
  [/welcome|arriv|greet|hello/, ['👋', '🎉', '🤗']],
  [/announce|news|update|notice/, ['📢', '📣', '📰']],
  [/apply|join|recruit/, ['📝', '✍️', '🪪']],
  [/application|review/, ['📥', '🗳️', '📨']],
  [/server.?log|mod.?log|audit|\blogs?\b/, ['🧾', '🗃️', '🔍']],
  [/record|history|archive/, ['📋', '🗄️', '📦']],
  [/staff|mod|admin|team|manage/, ['🛡️', '👮', '🧑‍💼']],
  [/ticket|support|help|ask|faq|question/, ['🎫', '🆘', '❓']],
  [/general|chat|talk|lounge|hangout/, ['💬', '🗨️', '🛋️']],
  [/intro|about.?me/, ['🙋', '🪪', '🤝']],
  [/role|self.?role|color/, ['🎭', '🎨', '🏷️']],
  [/verify|verification/, ['✅', '🔐', '🛂']],
  [/event|schedule|calendar/, ['📅', '🗓️', '🎪']],
  [/giveaway|reward|prize/, ['🎁', '🏆', '🎟️']],
  [/stat|count|member/, ['📊', '📈', '👥']],
  [/suggest|idea|feedback/, ['💡', '🧠', '📮']],
  [/poll|vote/, ['🗳️', '📊', '✋']],
  [/level|rank|xp|leader/, ['⭐', '🏅', '📶']],
  [/birthday|bday/, ['🎂', '🥳', '🎈']],
  [/star|highlight|best/, ['🌟', '✨', '💫']],
  [/music|song|dj|radio/, ['🎵', '🎶', '🎧']],
  [/game|gaming|play/, ['🎮', '🕹️', '👾']],
  [/minecraft|mc\b/, ['⛏️', '🧱', '🌳']],
  [/gta|rp\b|roleplay|city/, ['🚗', '🏙️', '🚓']],
  [/valorant|fps|cs|shoot|bgmi|pubg|free.?fire/, ['🎯', '🔫', '💥']],
  [/meme|fun|joke/, ['😂', '🤪', '🎈']],
  [/media|clip|photo|pic|screenshot|video/, ['🖼️', '📸', '🎬']],
  [/art|draw|design|creative/, ['🎨', '🖌️', '✏️']],
  [/bot|command|cmd/, ['🤖', '⌨️', '🧩']],
  [/link|social|promo|partner|advert/, ['🔗', '🤝', '📣']],
  [/voice|vc|call|talk/, ['🔊', '🎙️', '📞']],
  [/afk|sleep|idle/, ['💤', '😴', '🌙']],
  [/stream|live|twitch|youtube/, ['📺', '🔴', '🎥']],
  [/info|about|resource|guide/, ['ℹ️', '📚', '🧭']],
  [/private|secret|vip|premium/, ['🔒', '💎', '👑']],
  [/trade|market|shop|sell|buy/, ['🛒', '💰', '🏪']],
  [/study|learn|code|dev|tech/, ['💻', '📘', '🧪']],
  [/food|cook/, ['🍕', '🍳', '🥗']],
  [/pet|animal/, ['🐾', '🐶', '🐱']],
  [/sport|football|cricket/, ['⚽', '🏏', '🏀']],
  [/community|manager/, ['💠', '🌐', '🏛️']],
];
const SPARE = ['🔷', '🔶', '🟣', '🟢', '🟡', '🟠', '🔵', '🟤', '⚪', '🔺', '🔻', '💠', '🌀', '🪐', '🌙', '☀️', '🌊', '🔥', '🌿', '🍀', '🌸', '🍁', '❄️', '⚡', '🌈', '🧊', '🪁', '🧿', '🎐', '🪄', '🛸', '🚀', '🗿', '🏝️', '🌋', '🗻', '🏮', '🎏', '🧭', '🪙'];

export const hasEmoji = (name: string) => EMOJI_RE.test(String(name || ''));

/** Emojis already used by any channel or category in the server. */
export function usedEmojis(guild: any): Set<string> {
  const used = new Set<string>();
  for (const c of guild.channels.cache.values()) for (const m of String(c.name).matchAll(ALL_EMOJI_RE)) used.add(m[0].replace(/️/g, ''));
  return used;
}

/** Best matching emoji for a name that no channel uses yet (falls back to a spare one). */
export function pickEmoji(guild: any, name: string, used = usedEmojis(guild), preferred: string[] = []): string {
  const plain = String(name).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  const choices = [...preferred, ...MAP.filter(([re]) => re.test(plain)).flatMap(([, e]) => e), ...SPARE];
  const e = choices.find((x) => !used.has(x.replace(/️/g, ''))) || choices[0];
  used.add(e.replace(/️/g, ''));
  return e;
}

/** Name with a unique emoji in the server's style: "📝・apply-to-join" for channels, "💠 NAME" for categories. */
export function emojiName(guild: any, plainName: string, opts: { category?: boolean; preferred?: string[]; used?: Set<string> } = {}) {
  if (hasEmoji(plainName)) return plainName;
  const e = pickEmoji(guild, plainName, opts.used, opts.preferred);
  return opts.category ? `${e} ${plainName}` : `${e}・${plainName}`;
}

/**
 * Adds a matching, unused emoji to every channel and category that has none. Channels the bot
 * can't manage and stats counters (renamed by the bot anyway) are skipped. Returns how many changed.
 */
export async function tidyChannelNames(guild: any, skipIds: string[] = [], max = 80): Promise<{ renamed: string[]; skipped: number }> {
  const me = guild.members.me;
  const used = usedEmojis(guild);
  const types = new Set([ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildStageVoice]);
  const todo = Array.from(guild.channels.cache.values()).filter((c: any) => types.has(c.type) && !hasEmoji(c.name) && !skipIds.includes(c.id))
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition) as any[];
  const renamed: string[] = [];
  let skipped = 0;
  for (const c of todo.slice(0, max)) {
    if (!c.permissionsFor(me)?.has([P.ViewChannel, P.ManageChannels])) { skipped++; continue; }
    const next = emojiName(guild, c.name, { category: c.type === ChannelType.GuildCategory, used });
    try { await c.setName(next, 'Community Manager: matching emoji for an easy-to-scan channel list'); renamed.push(next); } catch { skipped++; }
  }
  return { renamed, skipped: skipped + Math.max(0, todo.length - max) };
}

/** "📥・applications" → same name, but with an emoji no other channel uses (📥 preferred). */
export function uniqueName(guild: any, name: string) {
  const m = name.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*[・·]?\s*(.+)$/u);
  return m ? emojiName(guild, m[2], { preferred: [m[1]] }) : emojiName(guild, name);
}
