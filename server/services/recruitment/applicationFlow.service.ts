/**
 * The guided conversation inside each private application chat.
 *
 *   1. Consent   — the bot posts the server's rules and guide; the applicant presses "I have read and agree".
 *   2. Screening — rules questions, one at a time, 4 answer buttons. The applicant never sees the score.
 *                  Score and per-question results go to the private staff thread. Below the server's
 *                  screening threshold the bot explains each rule they got wrong before moving on.
 *                  AUTO: the bot runs it straight after consent. MANUAL: staff start it from the staff thread.
 *   3. Interview — AUTO: the bot asks the server's interview questions and collects typed answers.
 *                  MANUAL: an interviewer presses Start; the bot keeps the transcript and summarises on End.
 *   4. Decision  — staff approve / reject from the staff thread (or dashboard).
 *
 * Everything happens in ONE channel: the applicant-facing chat, plus a private staff thread inside it
 * that only authority members can see (escalations, scores, summaries, staff discussion).
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../logging/logger.js';
import { applicationsRepository } from '../../repositories/index.js';
import { communityQuestionsService } from '../communityQuestions.service.js';
import { getToolkit, guildFor, isSnowflake, ScreeningQuizQuestion } from '../toolkit/toolkitConfig.js';
import { reviewRoomsRepository, ReviewRoomDoc } from '../toolkit/reviewRooms.service.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type FlowStage = 'CONSENT' | 'SCREENING' | 'GUIDANCE' | 'SCREENING_HOLD' | 'INTERVIEW_WAIT' | 'INTERVIEW_AUTO' | 'INTERVIEW_MANUAL' | 'AWAITING_DECISION' | 'DECIDED';

export interface FlowState {
  stage: FlowStage;
  staffThreadId?: string;
  consentAt?: string;
  quiz?: { index: number; answers: number[]; score?: number; passed?: boolean; attempts: number; questionIds: string[] };
  interview?: { mode: 'AUTO' | 'MANUAL'; index: number; questions: string[]; answers: { q: string; a: string }[]; interviewerId?: string; startedAt?: string; transcript: { by: string; name: string; text: string; at: string }[] };
}

async function threshold(communityId: string): Promise<number> {
  try {
    const { settingsService } = await import('../settings.service.js');
    const s: any = await settingsService.getConsolidatedSettings(communityId);
    const t = Number(s?.recruitment?.screeningThreshold);
    return Number.isFinite(t) ? t : 75;
  } catch { return 75; }
}

async function room(roomId: string): Promise<(ReviewRoomDoc & { flow?: FlowState }) | null> {
  return (await reviewRoomsRepository.getById(roomId).catch(() => null)) as any;
}
async function saveFlow(roomId: string, flow: FlowState) {
  await reviewRoomsRepository.update(roomId, { flow } as any);
}
async function channels(r: ReviewRoomDoc & { flow?: FlowState }) {
  const guild = await guildFor(r.communityId);
  const chat: any = guild?.channels.cache.get(r.channelId) || null;
  const staff: any = r.flow?.staffThreadId ? (guild?.channels.cache.get(r.flow.staffThreadId) || (await guild?.channels.fetch(r.flow.staffThreadId).catch(() => null))) : null;
  return { guild, chat, staff };
}

/** Staff control panel, posted in the private staff thread. */
export function staffPanel(r: ReviewRoomDoc & { flow?: FlowState }, tierCount: number) {
  const stage = r.flow?.stage;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cm:room:voice:${r.id}`).setLabel(r.voiceChannelId ? 'End voice room' : 'Voice room').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cm:room:escalate:${r.id}`).setLabel('Escalate').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(r.tier >= tierCount - 1),
    new ButtonBuilder().setCustomId(`cm:flow:quiz:${r.id}`).setLabel('Send rules quiz').setEmoji('📝').setStyle(ButtonStyle.Secondary).setDisabled(stage === 'SCREENING' || stage === 'DECIDED'),
  );
  const interviewing = stage === 'INTERVIEW_MANUAL' || stage === 'INTERVIEW_AUTO';
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(interviewing ? `cm:flow:iend:${r.id}` : `cm:flow:istart:${r.id}`).setLabel(interviewing ? 'End interview' : 'Start interview').setEmoji('🎤').setStyle(interviewing ? ButtonStyle.Danger : ButtonStyle.Primary).setDisabled(stage === 'DECIDED'),
    new ButtonBuilder().setCustomId(`cm:room:approve:${r.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(stage === 'DECIDED'),
    new ButtonBuilder().setCustomId(`cm:room:reject:${r.id}`).setLabel('Reject').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(stage === 'DECIDED'),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cm:room:done:${r.id}`).setLabel('Mark a rank done').setEmoji('🏁').setStyle(ButtonStyle.Secondary).setDisabled(stage === 'DECIDED' || tierCount < 2),
    new ButtonBuilder().setCustomId(`cm:room:invite:${r.id}`).setLabel('Invite member').setEmoji('➕').setStyle(ButtonStyle.Secondary).setDisabled(stage === 'DECIDED'),
    new ButtonBuilder().setCustomId(`cm:room:uninvite:${r.id}`).setLabel('Remove invite').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(stage === 'DECIDED' || !(r as any).invited?.length),
  );
  return [row1, row2, row3];
}

export const applicationFlow = {
  /** Fresh staff panel for the room's current state (used to correct buttons on older panels). */
  async currentPanel(roomId: string) {
    const r: any = await room(roomId);
    if (!r) return null;
    const t = await getToolkit(r.communityId);
    return staffPanel(r, t.reviewRooms.tiers.length);
  },

  /** Room just opened: create the private staff thread, then greet the applicant and ask for consent. */
  async begin(roomId: string, staffRoleIds: string[], applicantInServer: boolean) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const { guild, chat } = await channels(r);
    if (!guild || !chat) return;

    // Private staff thread: only people added (role mention adds role members) and Manage Threads can see it.
    const staff: any = await chat.threads.create({ name: `🔒 Staff · ${r.applicantName}`.slice(0, 100), type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 10080, reason: 'Staff discussion for application' });
    const flow: FlowState = { stage: 'CONSENT', staffThreadId: staff.id };
    await saveFlow(roomId, flow);

    const app: any = await applicationsRepository.getById(r.applicationId).catch(() => null);
    const answers = (Array.isArray(app?.answers) ? app.answers : []).slice(0, 20).map((a: any) => ({ name: clip(String(a.questionText || a.questionId), 256), value: clip(String(a.answerText || '—'), 1024) }));
    await staff.send({
      content: `${staffRoleIds.map((id) => `<@&${id}>`).join(' ')} New application. This thread is **staff only**; the applicant cannot see it.`,
      allowedMentions: { roles: staffRoleIds },
      embeds: [{
        title: `📥 ${r.applicantName}`,
        color: 0x7c8cff,
        description: [
          isSnowflake(r.applicantId) ? `Applicant: <@${r.applicantId}>` : '',
          app?.recruiterCodeUsed ? `Recruiter code: **${app.recruiterCodeUsed}**` : '',
          `Screening: **${t.recruitment.screening.mode === 'AUTO' ? 'automatic (Community Manager)' : 'manual (interviewer)'}** · Interview: **${t.recruitment.interview.mode === 'AUTO' ? 'automatic (Community Manager)' : 'manual (interviewer)'}**`,
        ].filter(Boolean).join('\n'),
        fields: answers,
      }],
      components: staffPanel({ ...r, flow }, t.reviewRooms.tiers.length),
    });

    if (!applicantInServer) {
      await staff.send({ content: '⚠️ The applicant is not in the server yet, so they cannot see the application chat. It continues once they join.' });
      return;
    }
    await this.askConsent(roomId);
  },

  /** Rules + guide with an "I have read and agree" button (only the applicant can press it). */
  async askConsent(roomId: string) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const { chat, guild } = await channels(r);
    const rules = (await communityQuestionsService.listGuidelines(r.communityId).catch(() => [])).filter((g: any) => g.enabled !== false);
    const fields = rules.slice(0, 20).map((g: any) => ({ name: clip(`${g.category === 'RULE' ? '📜' : g.category === 'DISCIPLINARY' || g.category === 'DISQUALIFYING' ? '⛔' : '📘'} ${g.title}`, 256), value: clip(g.description || '—', 1024) }));
    await chat?.send({
      content: `👋 Welcome <@${r.applicantId}>! I'm **Community Manager**, and I'll guide you through your application to [**${guild?.name || 'the server'}**](https://discord.com/channels/${guild?.id || ''}) until the team takes over.`,
      allowedMentions: { users: [r.applicantId] },
      embeds: [{
        title: '📜 Rules and guide',
        color: 0xffc46b,
        description: t.recruitment.screening.consentText.replace(/\\n/g, '\n'),
        fields: fields.length ? fields : [{ name: 'Rules', value: 'Please read the rules channel of this server.' }],
      }],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:flow:consent:${roomId}`).setLabel('I have read and agree').setEmoji('✅').setStyle(ButtonStyle.Success))],
    });
  },

  async consent(interaction: any, roomId: string) {
    const r = await room(roomId);
    if (!r || r.status !== 'OPEN') return interaction.reply({ content: 'This application is closed.', ephemeral: true });
    if (interaction.user.id !== r.applicantId) return interaction.reply({ content: 'Only the applicant can confirm this.', ephemeral: true });
    if (r.flow?.consentAt) return interaction.reply({ content: 'Already confirmed, thank you!', ephemeral: true });
    const flow: FlowState = { ...(r.flow as FlowState), consentAt: new Date().toISOString() };
    await saveFlow(roomId, flow);
    await interaction.update({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:noop').setLabel(`Agreed by ${interaction.member?.displayName || interaction.user.username}`).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(true))] });
    const { staff } = await channels(r);
    await staff?.send({ content: `✅ <@${r.applicantId}> confirmed they read and agree to the rules (<t:${Math.floor(Date.now() / 1000)}:f>).`, allowedMentions: { parse: [] } });
    await this.afterConsent(roomId);
  },

  async afterConsent(roomId: string) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const { chat, staff } = await channels(r);
    if (t.recruitment.screening.questions.length) {
      if (t.recruitment.screening.mode === 'AUTO') return this.startQuiz(roomId);
      await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'SCREENING_HOLD' });
      await chat?.send({ content: 'Thank you! A team member will continue with you shortly.' });
      await staff?.send({ content: '📝 Screening is **manual**. Press **Send rules quiz** above when you are ready, or ask your own questions in the chat.' });
      return;
    }
    return this.toInterview(roomId);
  },

  /* ------------------------------ screening ------------------------------ */
  async startQuiz(roomId: string, byStaffId?: string) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const qs = t.recruitment.screening.questions;
    if (!qs.length) throw new Error('Add rules questions first (Server tools → Recruitment in Discord).');
    const attempts = (r.flow?.quiz?.attempts || 0) + 1;
    await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'SCREENING', quiz: { index: 0, answers: [], attempts, questionIds: qs.map((q) => q.id) } });
    const { chat, staff } = await channels(r);
    if (byStaffId) await staff?.send({ content: `📝 <@${byStaffId}> sent the rules quiz${attempts > 1 ? ` (attempt ${attempts})` : ''}.`, allowedMentions: { parse: [] } });
    await chat?.send({ content: `📝 **Quick rules check** — ${qs.length} question${qs.length > 1 ? 's' : ''}. Pick the answer you think is right. Take your time.` });
    await this.sendQuestion(roomId, 0);
  },

  async sendQuestion(roomId: string, index: number) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const q = t.recruitment.screening.questions.find((x) => x.id === r.flow?.quiz?.questionIds[index]);
    if (!q) return;
    const { chat } = await channels(r);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      q.options.slice(0, 4).map((_, i) => new ButtonBuilder().setCustomId(`cm:flow:ans:${roomId}:${index}.${i}`).setLabel(LETTERS[i]).setStyle(ButtonStyle.Secondary)),
    );
    await chat?.send({
      embeds: [{ title: `Question ${index + 1} of ${r.flow!.quiz!.questionIds.length}`, description: `**${q.question}**\n\n${q.options.slice(0, 4).map((o, i) => `**${LETTERS[i]}.** ${o}`).join('\n')}`, color: 0x7c8cff }],
      components: [row],
    });
  },

  async answer(interaction: any, roomId: string, ref: string) {
    const [indexStr, optStr] = ref.split('.');
    const index = Number(indexStr), opt = Number(optStr);
    const r = await room(roomId);
    if (!r || r.status !== 'OPEN' || r.flow?.stage !== 'SCREENING' || !r.flow.quiz) return interaction.reply({ content: 'This quiz is not active.', ephemeral: true });
    if (interaction.user.id !== r.applicantId) return interaction.reply({ content: 'Only the applicant answers these questions.', ephemeral: true });
    if (index !== r.flow.quiz.index) return interaction.reply({ content: 'Already answered.', ephemeral: true });
    const quiz = { ...r.flow.quiz, answers: [...r.flow.quiz.answers, opt], index: index + 1 };
    await saveFlow(roomId, { ...r.flow, quiz });
    // Hide correctness: just confirm the choice and remove the buttons.
    await interaction.update({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:noop').setLabel(`Answered ${LETTERS[opt]}`).setStyle(ButtonStyle.Secondary).setDisabled(true))] });
    if (quiz.index < quiz.questionIds.length) return this.sendQuestion(roomId, quiz.index);
    return this.finishQuiz(roomId);
  },

  async finishQuiz(roomId: string) {
    const r = await room(roomId);
    if (!r?.flow?.quiz) return;
    const t = await getToolkit(r.communityId);
    const byId = new Map(t.recruitment.screening.questions.map((q) => [q.id, q] as const));
    const qs = r.flow.quiz.questionIds.map((id) => byId.get(id)).filter(Boolean) as ScreeningQuizQuestion[];
    const results = qs.map((q, i) => ({ q, given: r.flow!.quiz!.answers[i], ok: r.flow!.quiz!.answers[i] === q.correct }));
    const correct = results.filter((x) => x.ok).length;
    const score = Math.round((correct / Math.max(1, qs.length)) * 100);
    const need = await threshold(r.communityId);
    const passed = score >= need;
    const flow: FlowState = { ...r.flow, quiz: { ...r.flow.quiz, score, passed }, stage: passed ? 'INTERVIEW_WAIT' : 'GUIDANCE' };
    await saveFlow(roomId, flow);
    await applicationsRepository.update(r.applicationId, { screeningScore: score, screeningPassed: passed, recruitmentScore: score, updatedAt: new Date().toISOString() } as any).catch(() => undefined);

    const { chat, staff } = await channels(r);
    // Result to staff only.
    await staff?.send({
      embeds: [{
        title: `📊 Screening result: ${score}% ${passed ? '— passed' : '— below threshold'}`,
        color: passed ? 0x7fe0b0 : 0xff5c8a,
        description: `${correct} of ${qs.length} correct · threshold ${need}% · attempt ${r.flow.quiz.attempts}`,
        fields: results.slice(0, 25).map((x, i) => ({
          name: clip(`${x.ok ? '✅' : '❌'} ${i + 1}. ${x.q.question}`, 256),
          value: clip(`Answered **${LETTERS[x.given] ?? '?'}. ${x.q.options[x.given] ?? '—'}**${x.ok ? '' : `\nCorrect: **${LETTERS[x.q.correct]}. ${x.q.options[x.q.correct]}**`}`, 1024),
        })),
      }],
    });

    import('./sheetsSync.service.js').then(({ sheetsSync }) => sheetsSync.push(r.applicationId)).catch(() => undefined);
    import('./recruitmentLog.service.js').then(({ recruitmentLog }) => recruitmentLog.post(r.communityId, `📊 Screening for **${r.applicantName}**: **${score}%** (threshold ${need}%) — ${passed ? 'passed' : 'below threshold, guidance given'}.`)).catch(() => undefined);
    if (passed) {
      await chat?.send({ content: '✅ Thank you, your answers have been shared with the team.' });
      return this.toInterview(roomId);
    }
    // Below threshold: teach the rules they missed (without showing a score).
    const wrong = results.filter((x) => !x.ok);
    await chat?.send({
      content: `Thank you <@${r.applicantId}>. Before we move on, here are a few rules worth a second look:`,
      allowedMentions: { users: [r.applicantId] },
      embeds: [{
        title: '📘 Let’s go over these together',
        color: 0xffc46b,
        fields: wrong.slice(0, 25).map((x) => ({ name: clip(x.q.question, 256), value: clip(`The right answer is **${x.q.options[x.q.correct]}**.${x.q.explain ? `\n${x.q.explain}` : ''}`, 1024) })),
      }],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:flow:understood:${roomId}`).setLabel('I understand').setEmoji('👍').setStyle(ButtonStyle.Primary))],
    });
  },

  async understood(interaction: any, roomId: string) {
    const r = await room(roomId);
    if (!r || r.flow?.stage !== 'GUIDANCE') return interaction.reply({ content: 'Nothing to confirm right now.', ephemeral: true });
    if (interaction.user.id !== r.applicantId) return interaction.reply({ content: 'Only the applicant can confirm this.', ephemeral: true });
    await interaction.update({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:noop').setLabel('Understood').setEmoji('👍').setStyle(ButtonStyle.Primary).setDisabled(true))] });
    const t = await getToolkit(r.communityId);
    const { chat, staff } = await channels(r);
    await staff?.send({ content: `👍 <@${r.applicantId}> read the explanations for the rules they missed.`, allowedMentions: { parse: [] } });
    if (t.recruitment.screening.onFail === 'GUIDE_AND_HOLD') {
      await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'SCREENING_HOLD' });
      await chat?.send({ content: 'Thanks! A team member will continue with you shortly.' });
      await staff?.send({ content: '⏸️ Screening was below the threshold. Decide the next step: **Send rules quiz** again, **Start interview**, or **Reject**.' });
      return;
    }
    return this.toInterview(roomId);
  },

  /* ------------------------------ interview ------------------------------ */
  async toInterview(roomId: string) {
    const r = await room(roomId);
    if (!r) return;
    const t = await getToolkit(r.communityId);
    const { chat, staff } = await channels(r);
    if (t.recruitment.interview.mode === 'AUTO') return this.startInterview(roomId, null);
    await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'INTERVIEW_WAIT' });
    await chat?.send({ content: '🎤 Next is a short interview with our team. An interviewer will join you here soon. Feel free to say hello!' });
    await staff?.send({ content: '🎤 Ready for the interview. An interviewer can press **Start interview**. Use **Voice room** to talk instead of typing.' });
  },

  async startInterview(roomId: string, interviewer: any | null) {
    const r = await room(roomId);
    if (!r || r.status !== 'OPEN') throw new Error('This application is closed.');
    if (interviewer && (r.flow?.stage === 'INTERVIEW_MANUAL' || r.flow?.stage === 'INTERVIEW_AUTO')) {
      throw new Error(`An interview is already running${r.flow?.interview?.interviewerId ? ` (started by <@${r.flow.interview.interviewerId}>)` : ''}. Press **End interview** when it is finished.`);
    }
    const t = await getToolkit(r.communityId);
    const { chat, staff } = await channels(r);
    if (!interviewer) {
      const qs = (await communityQuestionsService.listInterviewQuestions(r.communityId).catch(() => [])).filter((q: any) => q.enabled !== false).map((q: any) => q.questionText);
      if (!qs.length) {
        await staff?.send({ content: '⚠️ Automatic interview is on, but there are no interview questions (Recruitment → Questions). Waiting for an interviewer.' });
        await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'INTERVIEW_WAIT' });
        return;
      }
      await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'INTERVIEW_AUTO', interview: { mode: 'AUTO', index: 0, questions: qs, answers: [], startedAt: new Date().toISOString(), transcript: [] } });
      await chat?.send({ content: `🎤 **Interview** — I'll ask you ${qs.length} question${qs.length > 1 ? 's' : ''}. Just type your answer as a message.\n\n**1.** ${qs[0]}` });
      await staff?.send({ content: '🎤 Community Manager started the automatic interview. Answers will be posted here when it finishes.' });
      return;
    }
    await saveFlow(roomId, { ...(r.flow as FlowState), stage: 'INTERVIEW_MANUAL', interview: { mode: 'MANUAL', index: 0, questions: [], answers: [], interviewerId: interviewer.id, startedAt: new Date().toISOString(), transcript: [] } });
    await chat?.send({ content: `🎤 <@${r.applicantId}>, **${interviewer.displayName || interviewer.user?.username}** is interviewing you now.`, allowedMentions: { users: [r.applicantId] } });
    await staff?.send({ content: `🎤 <@${interviewer.id}> started the interview. I'm keeping the transcript and will post a summary when you press **End interview**.`, allowedMentions: { parse: [] }, components: staffPanel({ ...(r as any), flow: { ...(r.flow as FlowState), stage: 'INTERVIEW_MANUAL' } }, t.reviewRooms.tiers.length) });
  },

  /** Messages typed in the application chat (from the gateway). */
  async onChatMessage(message: any) {
    const r = await roomForChannel(message.channel.id);
    if (!r || r.status !== 'OPEN' || !r.flow) return;
    const flow = r.flow;
    if (flow.stage === 'INTERVIEW_AUTO' && flow.interview && message.author.id === r.applicantId) {
      const iv = { ...flow.interview };
      iv.answers = [...iv.answers, { q: iv.questions[iv.index], a: String(message.content || '').slice(0, 1500) }];
      iv.index += 1;
      await saveFlow(r.id, { ...flow, interview: iv });
      if (iv.index < iv.questions.length) {
        await message.channel.send({ content: `**${iv.index + 1}.** ${iv.questions[iv.index]}` });
      } else {
        await this.endInterview(r.id, null);
      }
      return;
    }
    if (flow.stage === 'INTERVIEW_MANUAL' && flow.interview) {
      const iv = { ...flow.interview, transcript: [...flow.interview.transcript, { by: message.author.id, name: message.member?.displayName || message.author.username, text: String(message.content || '').slice(0, 1000), at: new Date().toISOString() }].slice(-300) };
      await saveFlow(r.id, { ...flow, interview: iv });
    }
  },

  async endInterview(roomId: string, by: any | null) {
    const r = await room(roomId);
    if (!r?.flow?.interview || !['INTERVIEW_MANUAL', 'INTERVIEW_AUTO'].includes(String(r.flow.stage))) throw new Error('No interview is running.');
    const t = await getToolkit(r.communityId);
    const iv = r.flow.interview;
    await saveFlow(roomId, { ...r.flow, stage: 'AWAITING_DECISION', interview: { ...iv } });
    const { chat, staff } = await channels(r);
    await chat?.send({ content: '🙏 Thank you! The interview is complete. The team will share the decision with you soon.' });

    const lines = iv.mode === 'AUTO'
      ? iv.answers.map((x, i) => `**${i + 1}. ${x.q}**\n${x.a}`)
      : iv.transcript.map((x) => `**${x.name}:** ${x.text}`);
    const summary = await summarise(iv.mode === 'AUTO' ? iv.answers.map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n\n') : iv.transcript.map((x) => `${x.name}: ${x.text}`).join('\n'));
    const body = lines.join('\n\n') || '_No messages were recorded._';
    await staff?.send({
      content: `🎤 Interview finished${by ? ` by <@${by.id}>` : ' (automatic)'}.${iv.startedAt ? ` Started <t:${Math.floor(Date.parse(iv.startedAt) / 1000)}:R>.` : ''}`,
      allowedMentions: { parse: [] },
      embeds: [
        ...(summary ? [{ title: '🧠 Summary', description: clip(summary, 4000), color: 0x7c8cff }] : []),
        { title: iv.mode === 'AUTO' ? 'Answers' : 'Transcript', description: clip(body, 4000), color: 0x9aa3d9 },
      ],
      components: staffPanel({ ...(r as any), flow: { ...r.flow, stage: 'AWAITING_DECISION' } }, t.reviewRooms.tiers.length),
    });
    await applicationsRepository.update(r.applicationId, { interviewCompletedAt: new Date().toISOString(), interviewSummary: summary || undefined, updatedAt: new Date().toISOString() } as any).catch(() => undefined);
    import('./sheetsSync.service.js').then(({ sheetsSync }) => sheetsSync.push(r.applicationId)).catch(() => undefined);
    import('./recruitmentLog.service.js').then(({ recruitmentLog }) => recruitmentLog.post(r.communityId, `🎤 Interview finished for **${r.applicantName}**. Waiting for a decision.`)).catch(() => undefined);
  },

  async markDecided(roomId: string) {
    const r = await room(roomId);
    if (r?.flow) await saveFlow(roomId, { ...r.flow, stage: 'DECIDED' });
  },

  /** Staff thread for posting (escalations etc.). */
  async staffThread(roomId: string): Promise<any | null> {
    const r = await room(roomId);
    if (!r) return null;
    return (await channels(r)).staff;
  },

  /** Is this member staff for the room? */
  async isStaff(communityId: string, member: any): Promise<boolean> {
    if (member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
    const t = await getToolkit(communityId);
    const roles = [...t.reviewRooms.tiers.flatMap((x) => x.roleIds), ...t.recruitment.reviewerRoleIds];
    return roles.some((id) => member?.roles?.cache?.has(id));
  },
};

/* ------------------------------ helpers ------------------------------ */
const channelCache = new Map<string, { at: number; id: string | null }>();
async function roomForChannel(channelId: string) {
  const hit = channelCache.get(channelId);
  if (hit && Date.now() - hit.at < 60_000) return hit.id ? room(hit.id) : null;
  const list = await reviewRoomsRepository.list({ where: [{ field: 'channelId', operator: '==', value: channelId }] }).catch(() => []);
  const r = (list as any[]).find((x) => x.status === 'OPEN') || null;
  channelCache.set(channelId, { at: Date.now(), id: r?.id || null });
  return r;
}
export function forgetChannel(channelId: string) { channelCache.delete(channelId); }

async function summarise(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  try {
    const { GeminiAIProvider } = await import('../ai/geminiProvider.js');
    const ai = new GeminiAIProvider();
    if (!ai.isConfigured()) return null;
    const out = await ai.generateText(
      `Summarise this Discord recruitment interview for the staff team in 4-6 short bullet points: communication, attitude, availability, knowledge of the community, and any concerns. Do not make the hiring decision.\n\n${text.slice(0, 12000)}`,
      { temperature: 0.2, maxTokens: 600 },
    );
    return out.text?.trim() || null;
  } catch (err: any) {
    logger.warn(`[ApplicationFlow] summary failed: ${err?.message}`);
    return null;
  }
}
