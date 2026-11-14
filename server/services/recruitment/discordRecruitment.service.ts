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
import { getToolkit, guildFor, isSnowflake, communityForGuild, OLD_PANEL_TEXT, DEFAULT_RECRUITMENT_MESSAGES } from '../toolkit/toolkitConfig.js';
import { discordService } from '../../integrations/discord/discord.service.js';

const PAGE = 5;
const appUrl = () => (process.env.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const fillMsg = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\\n/g, '\n');

interface Session { communityId: string; page: number; answers: Record<string, string>; code?: string; at: number }
const sessions = new Map<string, Session>(); // key: guildId_userId
/** The server an interaction is for: its own guild, or (in a DM) the server named in the button. */
const gidOf = (i: any): string => i.guildId || i.__gid || '';
/** Suffix that carries the server id on DM buttons and forms. */
const dmTag = (i: any) => (i.guildId ? '' : `:${gidOf(i)}`);

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

function modalFor(page: number, total: number, qs: any[], withCode: boolean, prev: Session | undefined, codeRequired = false, tag = '') {
  const modal = new ModalBuilder().setCustomId(`cm:apply:page:${page}${tag}`).setTitle(clip(total > 1 ? `Application (${page + 1}/${total})` : 'Application', 45));
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
      new TextInputBuilder().setCustomId('code').setLabel(codeRequired ? 'Recruiter code' : 'Recruiter code (optional)').setStyle(TextInputStyle.Short).setRequired(!!codeRequired).setMaxLength(40).setPlaceholder(codeRequired ? 'The code from the person who invited you' : 'Leave empty if nobody referred you'),
    ));
  }
  return modal;
}

export const discordRecruitment = {
  /* ------------------------------ Apply ------------------------------ */
  panel(cfg: Awaited<ReturnType<typeof getToolkit>>['recruitment'], serverName = 'our server') {
    return {
      embeds: [{ title: cfg.messages.panelTitle, description: fillMsg(!cfg.messages.panelText || cfg.messages.panelText === OLD_PANEL_TEXT ? DEFAULT_RECRUITMENT_MESSAGES.panelText : cfg.messages.panelText, { server: serverName }), color: 0x7c8cff }],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:apply:start').setLabel('Apply').setEmoji('📋').setStyle(ButtonStyle.Success))],
    };
  },

  async postPanel(communityId: string, channel: any) {
    const { secureGate } = await import('./secureGate.service.js');
    if (!(await secureGate.isVerified(communityId))) throw new Error('Finish Secure Setup first (Server tools → Recruitment in Discord). Recruitment stays off until your server is locked for newcomers.');
    const cfg = (await getToolkit(communityId)).recruitment;
    if (!(await questionsFor(communityId)).length) throw new Error('Add your application questions first (Recruitment → Questions).');
    const payload = this.panel(cfg, channel.guild?.name);
    // Update the panel already posted in this channel instead of sending a second one.
    const c: any = cfg;
    let msg: any = null;
    if (c.panelChannelId === channel.id && c.panelMessageId) msg = await channel.messages.fetch(c.panelMessageId).catch(() => null);
    if (!msg) {
      const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      msg = recent ? Array.from(recent.values()).find((m: any) => m.author?.id === channel.client.user.id && m.components?.[0]?.components?.some((x: any) => String(x.customId || '').startsWith('cm:apply:start'))) : null;
    }
    let updated = false;
    if (msg) updated = await msg.edit(payload).then(() => true).catch(() => false);
    if (!updated) msg = await channel.send(payload);
    const { saveToolkit } = await import('../toolkit/toolkitConfig.js');
    await saveToolkit(communityId, { recruitment: { ...cfg, panelPostedAt: new Date().toISOString(), panelChannelId: channel.id, panelMessageId: msg.id } as any });
    return { updated };
  },

  /** After the panel text is saved: refresh the posted panel, if any. */
  async refreshPanel(communityId: string) {
    const c: any = (await getToolkit(communityId)).recruitment;
    if (!c.panelChannelId || !c.panelMessageId) return;
    const guild = await guildFor(communityId);
    const ch: any = guild?.channels.cache.get(c.panelChannelId);
    const msg = await ch?.messages.fetch(c.panelMessageId).catch(() => null);
    if (msg) await msg.edit(this.panel(c, guild.name)).catch(() => undefined);
  },

  /** Button "Apply" or /apply. Shows the first page, or an explanation. */
  async start(interaction: any) {
    const communityId = await communityForGuild(gidOf(interaction));
    const cfg = (await getToolkit(communityId)).recruitment;
    if (!cfg.applyEnabled) return interaction.reply({ content: 'Applications are closed in this server right now.', ephemeral: true });
    const { gateRepository } = await import('./secureGate.service.js');
    const gate = await gateRepository.getById(communityId).catch(() => null);
    if (!gate?.verified) return interaction.reply({ content: '🔒 Applications open once the server owner finishes Secure Setup.', ephemeral: true });
    const { applicantRestrictionService } = await import('../applicantRestriction.service.js');
    const [qs, active, risk] = await Promise.all([
      questionsFor(communityId),
      applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'applicantDiscordUserId', operator: '==', value: interaction.user.id }] } as any).catch(() => []),
      applicantRestrictionService.checkApplicantRisk(communityId, interaction.user.id, interaction.user.username).catch(() => null),
    ]);
    if (!qs.length) return interaction.reply({ content: '⚠️ This server has not set up its application questions yet. Please tell the staff.', ephemeral: true });
    {
      // Blacklisted people are told before they fill the form.
      if (risk && (risk.riskStatus === 'BLACKLISTED' || risk.riskStatus === 'DO_NOT_REAPPLY')) return interaction.reply({ content: '🚫 You can’t apply to this server right now. If you think this is a mistake, please contact the server staff.', ephemeral: true });
      try {
        const { guardApplicant } = await import('../blacklist/blacklistGuard.service.js');
        await guardApplicant(communityId, { id: interaction.user.id, username: interaction.user.username, globalName: interaction.user.globalName, displayName: interaction.member?.displayName, avatar: interaction.user.displayAvatarURL?.() });
      } catch (e: any) { if (e?.blacklisted) return interaction.reply({ content: `🚫 ${e.message}`, ephemeral: true }); }
    }
    {
      const g: any = await guildFor(communityId);
      const m: any = g ? await g.members.fetch(interaction.user.id).catch(() => null) : null;
      if (!m) return interaction.reply({ content: 'Join the server first, then press Apply again.', ephemeral: true });
      if ((gate as any)?.memberRoleId && m.roles.cache.has((gate as any).memberRoleId)) return interaction.reply({ content: '✅ You are already a member of this server, so there is nothing to apply for.', ephemeral: true });
    }
    const open = (active as any[]).find((a) => ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_PENDING'].includes(a.status));
    if (open) return interaction.reply({ content: `⏳ You already have an application in review (submitted <t:${Math.floor(Date.parse(open.submittedAt || open.createdAt) / 1000)}:R>). You will get a DM when it is decided.`, ephemeral: true });

    const key = `${gidOf(interaction)}_${interaction.user.id}`;
    const prev = sessions.get(key);
    const session: Session = prev && Date.now() - prev.at < 30 * 60_000 ? { ...prev, page: 0 } : { communityId, page: 0, answers: {}, at: Date.now() };
    sessions.set(key, session);
    const { pages, codePage } = pagesFor(qs, cfg.askRecruiterCode);
    return interaction.showModal(modalFor(0, pages.length, pages[0], codePage === 0, session, !!cfg.codeRequired, dmTag(interaction)));
  },

  /** "Continue" button between pages. */
  async next(interaction: any, page: number) {
    const key = `${gidOf(interaction)}_${interaction.user.id}`;
    const session = sessions.get(key);
    if (!session) return interaction.reply({ content: '⌛ Your application timed out. Press **Apply** to start again.', ephemeral: true });
    const cfg = (await getToolkit(session.communityId)).recruitment;
    const { pages, codePage } = pagesFor(await questionsFor(session.communityId), cfg.askRecruiterCode);
    if (page >= pages.length) return interaction.reply({ content: 'Something went wrong. Press **Apply** to start again.', ephemeral: true });
    return interaction.showModal(modalFor(page, pages.length, pages[page], codePage === page, session, !!cfg.codeRequired, dmTag(interaction)));
  },

  /** A page was submitted: save answers, then show "Continue" or submit. */
  async pageSubmitted(interaction: any, page: number) {
    const key = `${gidOf(interaction)}_${interaction.user.id}`;
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
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:apply:next:${page + 1}${dmTag(interaction)}`).setLabel(`Continue (${page + 2}/${pages.length})`).setStyle(ButtonStyle.Primary))],
      });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const rc = (await getToolkit(session.communityId)).recruitment;
      if (rc.askRecruiterCode && rc.codeRequired && !session.code) throw new Error('A recruiter code is required in this server. Ask the person who invited you for their code.');
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

  /**
   * Someone joined: send them the Apply button by DM, so they don't have to find the right channel.
   * Only while recruitment is set up (Secure Setup done, applications open, questions added).
   */
  async welcomeDm(communityId: string, member: any) {
    if (member.user?.bot) return;
    const cfg = (await getToolkit(communityId)).recruitment as any;
    if (!cfg.applyEnabled || cfg.dmApplyOnJoin === false) return;
    const { gateRepository } = await import('./secureGate.service.js');
    const gate: any = await gateRepository.getById(communityId).catch(() => null);
    if (!gate?.verified) return;
    if (gate.memberRoleId && member.roles?.cache?.has(gate.memberRoleId)) return;
    if (!(await questionsFor(communityId)).length) return;
    const guild = member.guild;
    const panel = this.panel(cfg, guild.name);
    const embed = { ...panel.embeds[0], title: `👋 Welcome to ${guild.name}!`, thumbnail: guild.iconURL?.() ? { url: guild.iconURL({ size: 128 }) } : undefined };
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:apply:start:${guild.id}`).setLabel('Apply').setEmoji('📋').setStyle(ButtonStyle.Success));
    const sent = await member.send({ embeds: [embed], components: [row] }).then(() => true).catch((err: any) => { logger.info(`[Recruitment] welcome DM to ${member.id} failed: ${err?.message}`); return false; });
    if (sent) return;
    // DMs closed: show the same message in the apply channel and ping them so they see it.
    const ch: any = gate.applyChannelId ? guild.channels.cache.get(gate.applyChannelId) : null;
    await ch?.send({ content: `👋 <@${member.id}>, welcome! Your DMs are closed, so here is how to join. Press **Apply** below.`, embeds: [panel.embeds[0]], components: panel.components, allowedMentions: { users: [member.id] } }).catch(() => undefined);
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

    const { recruitmentLog } = await import('./recruitmentLog.service.js');
    const { sheetsSync } = await import('./sheetsSync.service.js');
    await recruitmentLog.post(app.communityId, `📥 New application from **${app.applicantDisplayNameSnapshot || app.applicantUsername}**${isSnowflake(applicantId) ? ` (<@${applicantId}>)` : ''}${app.recruiterCodeUsed ? ` · recruiter code **${app.recruiterCodeUsed}**${app.recruiterDiscordUserId ? ` (<@${String(app.recruiterDiscordUserId).replace(/^usr_/, '')}>)` : ''}` : ''}.`);
    await recruitmentLog.recruiter(app.communityId, app, 'APPLIED');
    void sheetsSync.push(app.id);

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

    // 1b. Applied on the website? Add them to the server now (or prepare an invite); then drop their stored login.
    if (isSnowflake(applicantId)) {
      const { webApply } = await import('./webApply.service.js');
      await webApply.onDecided(app.communityId, applicantId, approved).catch((e: any) => logger.warn(`[Recruitment] web join failed: ${e?.message}`));
    }

    // 2. Message the applicant with the server's own text.
    if (isSnowflake(applicantId)) {
      await discordService.sendDM(applicantId, fillMsg(approved ? cfg.messages.approved : cfg.messages.rejected, vars)).catch(() => undefined);
    }

    // 2a. Rejected while waiting in the server: remove them (after the DM above, so they still get the message).
    //     Only newcomers are removed: anyone holding the member role, a staff role or any role besides Applicant stays.
    if (!approved && guild && isSnowflake(applicantId) && (cfg as any).kickOnReject !== false) {
      const m: any = await guild.members.fetch(applicantId).catch(() => null);
      if (m && !m.user?.bot) {
        const { getGate } = await import('./secureGate.service.js');
        const gate: any = await getGate(app.communityId).catch(() => ({}));
        const otherRoles = m.roles.cache.filter((r: any) => r.id !== guild.id && r.id !== gate.applicantRoleId);
        if (!otherRoles.size) {
          await new Promise((r) => setTimeout(r, 1500));
          const kicked = await m.kick(`Application rejected${reason ? `: ${String(reason).slice(0, 300)}` : ''}`).then(() => true).catch(() => false);
          const { recruitmentLog } = await import('./recruitmentLog.service.js');
          await recruitmentLog.post(app.communityId, kicked ? `👢 **${vars.applicant}** was removed from the server after the rejection.` : `⚠️ Could not remove **${vars.applicant}** after the rejection: give the bot Kick Members and put its role above theirs.`).catch(() => undefined);
        }
      }
    }

    // 2b. Already in the server? Then they have joined: mark it and run join-time role rules.
    if (approved && guild && isSnowflake(applicantId)) {
      const member = await guild.members.fetch(applicantId).catch(() => null);
      if (member) {
        const { applicationWorkflowService } = await import('../applicationWorkflow.service.js');
        await applicationWorkflowService.confirmDiscordJoin(app.communityId, applicantId).catch((err: any) => logger.warn(`[Recruitment] auto-join confirm failed: ${err?.message}`));
        // Already in the server (waiting room), so no join event will come: credit the recruiter now
        // (recruiter record, invite rewards, wallet).
        const { referralLifecycleService } = await import('../referralLifecycle.service.js');
        await referralLifecycleService.confirmMemberJoin(app.communityId, applicantId).catch((err: any) => logger.warn(`[Recruitment] recruiter credit failed: ${err?.message}`));
      }
    }

    // 2c. Open the server for them (Member role) and tell the log channel + recruiter; update the sheet.
    if (approved && isSnowflake(applicantId)) {
      const { secureGate } = await import('./secureGate.service.js');
      await secureGate.onApproved(app.communityId, applicantId).catch(() => undefined);
      // Every approved member can become a recruiter: give them their own code (if turned on) and DM it.
      const { issueMemberCode } = await import('../../controllers/toolkit.controller.js');
      await issueMemberCode(app.communityId, applicantId, vars.applicant).catch(() => undefined);
    }
    {
      const { recruitmentLog } = await import('./recruitmentLog.service.js');
      const { sheetsSync } = await import('./sheetsSync.service.js');
      await recruitmentLog.post(app.communityId, `${approved ? '✅ Approved' : '✖️ Rejected'}: **${vars.applicant}**${isSnowflake(reviewerDiscordId) ? ` by <@${reviewerDiscordId}>` : ''}${!approved && reason ? ` · reason: ${reason}` : ''}${app.recruiterCodeUsed ? ` · recruiter code **${app.recruiterCodeUsed}**` : ''}.`);
      await recruitmentLog.recruiter(app.communityId, app, approved ? 'APPROVED' : 'REJECTED');
      setTimeout(() => void sheetsSync.push(app.id), 3000);
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
    const communityId = await communityForGuild(gidOf(interaction));
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
