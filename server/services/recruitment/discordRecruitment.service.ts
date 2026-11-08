/**
 * Recruitment inside Discord.
 *
 *  Apply:   "Apply" panel button or /apply -> the server's application questions as Discord forms
 *           (5 questions per page, "Continue" between pages) -> the normal application workflow.
 *  Review:  every application is posted in the staff review channel with all answers and
 *           Approve / Reject buttons plus a dashboard link. The post's link is saved on the
 *           application so the dashboard can jump straight to it.
 *  Decide:  from Discord or the dashboard, the review post is updated, the applicant gets the
 *           server's own message, an optional welcome announcement is posted, and role rules run.
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} from 'discord.js';
import { logger } from '../../logging/logger.js';
import { applicationsRepository } from '../../repositories/index.js';
import { communityQuestionsService } from '../communityQuestions.service.js';
import { getToolkit, guildFor, isSnowflake, communityForGuild } from '../toolkit/toolkitConfig.js';
import { discordService } from '../../integrations/discord/discord.service.js';

const PAGE = 5;
const appUrl = () => (process.env.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const fillMsg = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\\n/g, '\n');

interface Session { communityId: string; page: number; answers: Record<string, string>; code?: string; at: number }
const sessions = new Map<string, Session>(); // key: guildId_userId

const qCache = new Map<string, { at: number; qs: any[] }>();
async function questionsFor(communityId: string) {
  const hit = qCache.get(communityId);
  if (hit && Date.now() - hit.at < 60_000) return hit.qs;
  const qs = (await communityQuestionsService.listApplicationQuestions(communityId)).filter((q: any) => q.enabled !== false);
  qCache.set(communityId, { at: Date.now(), qs });
  return qs;
}

/** Pages of questions; the recruiter-code field rides on the last page when there is room, else gets its own page. */
function pagesFor(questions: any[], askCode: boolean) {
  const pages: any[][] = [];
  for (let i = 0; i < questions.length; i += PAGE) pages.push(questions.slice(i, i + PAGE));
  if (!pages.length) pages.push([]);
  const codeOnOwnPage = askCode && pages[pages.length - 1].length >= PAGE;
  if (codeOnOwnPage) pages.push([]);
  return { pages, codePage: askCode ? pages.length - 1 : -1 };
}

function modalFor(page: number, total: number, qs: any[], withCode: boolean, prev: Session | undefined) {
  const modal = new ModalBuilder().setCustomId(`cm:apply:page:${page}`).setTitle(clip(total > 1 ? `Application (${page + 1}/${total})` : 'Application', 45));
  for (const q of qs) {
    const options = Array.isArray(q.options) && q.options.length ? ` Options: ${q.options.join(', ')}` : '';
    const long = q.type === 'LONG_TEXT' || q.type === 'PARAGRAPH' || String(q.questionText).length > 45;
    const input = new TextInputBuilder()
      .setCustomId(`q:${q.id}`)
      .setLabel(clip(q.questionText, 45))
      .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(Boolean(q.required))
      .setMaxLength(long ? 1500 : 300);
    const ph = clip(`${String(q.questionText).length > 45 ? q.questionText : q.guidance || ''}${options}`.trim(), 100);
    if (ph) input.setPlaceholder(ph);
    const old = prev?.answers[q.id];
    if (old) input.setValue(old);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  if (withCode) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('code').setLabel('Recruiter code (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder('Leave empty if nobody referred you'),
    ));
  }
  return modal;
}

export const discordRecruitment = {
  /* ------------------------------ Apply ------------------------------ */
  panel(cfg: Awaited<ReturnType<typeof getToolkit>>['recruitment']) {
    return {
      embeds: [{ title: cfg.messages.panelTitle, description: fillMsg(cfg.messages.panelText, {}), color: 0x7c8cff }],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:apply:start').setLabel('Apply').setEmoji('📋').setStyle(ButtonStyle.Success))],
    };
  },

  async postPanel(communityId: string, channel: any) {
    const cfg = (await getToolkit(communityId)).recruitment;
    if (!(await questionsFor(communityId)).length) throw new Error('Add your application questions first (Recruitment → Questions).');
    await channel.send(this.panel(cfg));
  },

  /** Button "Apply" or /apply. Shows the first page, or an explanation. */
  async start(interaction: any) {
    const communityId = await communityForGuild(interaction.guildId);
    const cfg = (await getToolkit(communityId)).recruitment;
    if (!cfg.applyEnabled) return interaction.reply({ content: 'Applications are closed in this server right now.', ephemeral: true });
    const [qs, active] = await Promise.all([questionsFor(communityId), applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'applicantDiscordUserId', operator: '==', value: interaction.user.id }] } as any).catch(() => [])]);
    if (!qs.length) return interaction.reply({ content: '⚠️ This server has not set up its application questions yet. Please tell the staff.', ephemeral: true });
    const open = (active as any[]).find((a) => ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_PENDING'].includes(a.status));
    if (open) return interaction.reply({ content: `⏳ You already have an application in review (submitted <t:${Math.floor(Date.parse(open.submittedAt || open.createdAt) / 1000)}:R>). You will get a DM when it is decided.`, ephemeral: true });

    const key = `${interaction.guildId}_${interaction.user.id}`;
    const prev = sessions.get(key);
    const session: Session = prev && Date.now() - prev.at < 30 * 60_000 ? { ...prev, page: 0 } : { communityId, page: 0, answers: {}, at: Date.now() };
    sessions.set(key, session);
    const { pages, codePage } = pagesFor(qs, cfg.askRecruiterCode);
    return interaction.showModal(modalFor(0, pages.length, pages[0], codePage === 0, session));
  },

  /** "Continue" button between pages. */
  async next(interaction: any, page: number) {
    const key = `${interaction.guildId}_${interaction.user.id}`;
    const session = sessions.get(key);
    if (!session) return interaction.reply({ content: '⌛ Your application timed out. Press **Apply** to start again.', ephemeral: true });
    const cfg = (await getToolkit(session.communityId)).recruitment;
    const { pages, codePage } = pagesFor(await questionsFor(session.communityId), cfg.askRecruiterCode);
    if (page >= pages.length) return interaction.reply({ content: 'Something went wrong. Press **Apply** to start again.', ephemeral: true });
    return interaction.showModal(modalFor(page, pages.length, pages[page], codePage === page, session));
  },

  /** A page was submitted: save answers, then show "Continue" or submit. */
  async pageSubmitted(interaction: any, page: number) {
    const key = `${interaction.guildId}_${interaction.user.id}`;
    const session = sessions.get(key);
    if (!session) return interaction.reply({ content: '⌛ Your application timed out. Press **Apply** to start again.', ephemeral: true });
    for (const row of interaction.fields.fields.values()) {
      const id = String(row.customId);
      if (id === 'code') session.code = String(row.value || '').trim() || undefined;
      else if (id.startsWith('q:')) session.answers[id.slice(2)] = String(row.value || '').trim();
    }
    session.at = Date.now();
    const cfg = (await getToolkit(session.communityId)).recruitment;
    const qs = await questionsFor(session.communityId);
    const { pages } = pagesFor(qs, cfg.askRecruiterCode);

    if (page + 1 < pages.length) {
      return interaction.reply({
        content: `✅ Page ${page + 1} of ${pages.length} saved.`,
        ephemeral: true,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:apply:next:${page + 1}`).setLabel(`Continue (${page + 2}/${pages.length})`).setStyle(ButtonStyle.Primary))],
      });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const { applicationWorkflowService } = await import('../applicationWorkflow.service.js');
      const member: any = interaction.member;
      await applicationWorkflowService.submitApplication({
        communityId: session.communityId,
        applicantDiscordUserId: interaction.user.id,
        applicantUsername: interaction.user.username,
        applicantDisplayName: member?.displayName || interaction.user.globalName || interaction.user.username,
        recruiterCode: session.code,
        source: 'DISCORD',
        answers: qs.map((q: any) => ({ questionId: q.id, answerText: session.answers[q.id] || '' })),
      });
      sessions.delete(key);
      await interaction.editReply({ content: '🎉 **Application sent!** The team has been notified. You will get a DM when it is reviewed.' });
    } catch (err: any) {
      const msg = String(err?.message || 'Could not submit.').replace(/^[A-Z_]+:\s*/, '');
      await interaction.editReply({ content: `⚠️ ${msg}${/code/i.test(msg) ? '\nPress **Apply** again to fix the recruiter code; your answers are kept for 30 minutes.' : ''}` });
    }
  },

  /* ------------------------------ Review post ------------------------------ */
  reviewButtons(appId: string, decided: boolean) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (!decided) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`cm:rv:approve:${appId}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cm:rv:reject:${appId}`).setLabel('Reject').setEmoji('✖️').setStyle(ButtonStyle.Danger),
      );
    }
    row.addComponents(new ButtonBuilder().setLabel('Open in dashboard').setStyle(ButtonStyle.Link).setURL(`${appUrl()}/dashboard?application=${encodeURIComponent(appId)}`));
    return [row];
  },

  reviewEmbed(app: any, extra?: { status?: string; by?: string; reason?: string; roomUrl?: string }) {
    const answers = (Array.isArray(app.answers) ? app.answers : []).slice(0, 20).map((a: any) => ({
      name: clip(String(a.questionText || a.questionId), 256), value: clip(String(a.answerText || (a.answerValues || []).join(', ') || '—'), 1024),
    }));
    const status = extra?.status || app.status;
    const color = status === 'APPROVED' || status === 'JOIN_PENDING' || status === 'JOINED' ? 0x7fe0b0 : status === 'REJECTED' ? 0xff5c8a : 0x7c8cff;
    const id = app.applicantDiscordUserId || app.applicantDiscordId;
    return {
      title: `📥 Application · ${app.applicantDisplayNameSnapshot || app.applicantUsernameSnapshot || app.applicantUsername || 'Applicant'}`,
      color,
      description: [
        isSnowflake(id) ? `Applicant: <@${id}> (\`${app.applicantUsernameSnapshot || app.applicantUsername || id}\`)` : '',
        app.recruiterCodeUsed || app.recruiterCode ? `Recruiter code: **${app.recruiterCodeUsed || app.recruiterCode}**` : '',
        `Submitted <t:${Math.floor(Date.parse(app.submittedAt || app.createdAt || new Date().toISOString()) / 1000)}:R> · via ${app.source === 'DISCORD' ? 'Discord' : 'website'}`,
        extra?.roomUrl ? `Review room: ${extra.roomUrl}` : '',
        status === 'APPROVED' || status === 'JOIN_PENDING' || status === 'JOINED' ? `\n✅ **Approved**${extra?.by ? ` by <@${extra.by}>` : ''}` : '',
        status === 'REJECTED' ? `\n✖️ **Rejected**${extra?.by ? ` by <@${extra.by}>` : ''}${extra?.reason ? `\nReason: ${clip(extra.reason, 500)}` : ''}` : '',
      ].filter(Boolean).join('\n'),
      fields: answers,
      footer: { text: `Application ${app.id}` },
    };
  },

  /** Called after a new application is created. */
  async onSubmitted(applicationId: string) {
    const app: any = await applicationsRepository.getById(applicationId);
    if (!app) return;
    const cfg = (await getToolkit(app.communityId)).recruitment;
    const guild = await guildFor(app.communityId);
    const applicantId = app.applicantDiscordUserId || app.applicantDiscordId;

    if (guild && cfg.reviewChannelId) {
      const channel: any = guild.channels.cache.get(cfg.reviewChannelId);
      if (channel) {
        const pings = cfg.pingRoleIds.filter((r) => guild.roles.cache.has(r));
        const msg = await channel.send({
          content: pings.length ? `${pings.map((r) => `<@&${r}>`).join(' ')} New application` : undefined,
          allowedMentions: { roles: pings },
          embeds: [this.reviewEmbed(app)],
          components: this.reviewButtons(app.id, false),
        }).catch((err: any) => { logger.warn(`[Recruitment] review post failed: ${err?.message}`); return null; });
        if (msg) await applicationsRepository.update(app.id, { discordReviewChannelId: channel.id, discordReviewMessageId: msg.id, discordReviewUrl: msg.url } as any).catch(() => undefined);
      }
    }

    if (cfg.dmOnReceived && isSnowflake(applicantId)) {
      await discordService.sendDM(applicantId, fillMsg(cfg.messages.received, {
        applicant: app.applicantDisplayNameSnapshot || app.applicantUsername || 'there', server: guild?.name || 'the server',
      })).catch(() => undefined);
    }
  },

  /** Called after a decision from anywhere (Discord buttons, slash commands, review rooms, dashboard). */
  async onDecided(applicationId: string, status: string, reviewerDiscordId?: string, reason?: string) {
    const app: any = await applicationsRepository.getById(applicationId);
    if (!app) return;
    const cfg = (await getToolkit(app.communityId)).recruitment;
    const guild = await guildFor(app.communityId);
    const approved = status === 'APPROVED';
    const applicantId = app.applicantDiscordUserId || app.applicantDiscordId;
    const vars = {
      applicant: app.applicantDisplayNameSnapshot || app.applicantUsername || 'there',
      mention: isSnowflake(applicantId) ? `<@${applicantId}>` : app.applicantUsername || 'our new member',
      server: guild?.name || 'the server',
      reviewer: isSnowflake(reviewerDiscordId) ? (guild?.members?.cache?.get(reviewerDiscordId)?.displayName || 'our team') : 'our team',
      reason: reason || 'Not specified',
    };

    // 1. Update the original review post in Discord.
    if (guild && app.discordReviewChannelId && app.discordReviewMessageId) {
      const ch: any = guild.channels.cache.get(app.discordReviewChannelId);
      const msg = await ch?.messages?.fetch(app.discordReviewMessageId).catch(() => null);
      await msg?.edit({ content: msg.content || undefined, embeds: [this.reviewEmbed(app, { status, by: isSnowflake(reviewerDiscordId) ? reviewerDiscordId : undefined, reason })], components: this.reviewButtons(app.id, true), allowedMentions: { parse: [] } }).catch(() => undefined);
    }

    // 2. Message the applicant with the server's own text.
    if (isSnowflake(applicantId)) {
      await discordService.sendDM(applicantId, fillMsg(approved ? cfg.messages.approved : cfg.messages.rejected, vars)).catch(() => undefined);
    }

    // 3. Welcome announcement.
    if (approved && guild && cfg.announceChannelId) {
      const ch: any = guild.channels.cache.get(cfg.announceChannelId);
      await ch?.send({ content: fillMsg(cfg.messages.announce, vars), allowedMentions: { users: isSnowflake(applicantId) ? [applicantId] : [] } }).catch(() => undefined);
    }
  },

  /** Approve / Reject buttons on the review post. */
  async canReview(communityId: string, member: any): Promise<boolean> {
    if (member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
    const t = await getToolkit(communityId);
    const roles = [...t.recruitment.reviewerRoleIds, ...t.recruitment.pingRoleIds, ...t.reviewRooms.tiers.flatMap((x) => x.roleIds)];
    return roles.some((r) => member?.roles?.cache?.has(r));
  },

  rejectModal(appId: string) {
    return new ModalBuilder().setCustomId(`cm:rv:rejectreason:${appId}`).setTitle('Reject application').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (sent to the applicant)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
    );
  },

  async decide(interaction: any, appId: string, approve: boolean, reason?: string) {
    const communityId = await communityForGuild(interaction.guildId);
    const app: any = await applicationsRepository.getById(appId).catch(() => null);
    if (!app || app.communityId !== communityId) return interaction.reply({ content: '⚠️ Application not found.', ephemeral: true });
    if (!(await this.canReview(communityId, interaction.member))) return interaction.reply({ content: '⛔ Only reviewers can decide applications.', ephemeral: true });
    if (!['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_PENDING', 'INTERVIEW_COMPLETED'].includes(app.status)) {
      return interaction.reply({ content: `This application is already **${String(app.status).toLowerCase().replace(/_/g, ' ')}**.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const { applicationWorkflowService } = await import('../applicationWorkflow.service.js');
      await applicationWorkflowService.reviewApplication({
        applicationId: appId, communityId, status: approve ? 'APPROVED' : 'REJECTED', rejectionReason: reason, reviewerNotes: reason,
        actorUserId: `usr_${interaction.user.id}`, actorRole: 'RECRUITER' as any, actorDiscordUserId: interaction.user.id,
      });
      await interaction.editReply({ content: approve ? '✅ Approved. The applicant has been messaged and role rules applied.' : '✖️ Rejected. The applicant has been messaged.' });
    } catch (err: any) {
      await interaction.editReply({ content: `⚠️ ${String(err?.message || err).replace(/^[A-Z_]+:\s*/, '')}` });
    }
  },
};
