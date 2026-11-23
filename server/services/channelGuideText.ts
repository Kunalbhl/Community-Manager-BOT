/** Wording of the pinned channel guides (kept free of imports so it can be tested alone). */
export const GUIDE_FOOTER = 'Community Manager · channel guide';

export type Guide = { title: string; body: string; staff: boolean };

export const GUIDES: Record<'apply' | 'welcome' | 'review' | 'recruitmentLog' | 'serverLog', Guide> = {
  apply: {
    staff: false,
    title: '📝 How to apply',
    body: [
      'This is where you join the community.',
      '',
      '**1.** Press the **Apply** button in this channel.',
      '**2.** Answer the questions honestly. Your answers go privately to the staff, not to other members.',
      '**3.** Wait for the decision. You get a direct message when staff approve or reject you.',
      '',
      'Until you are approved you only see a few public channels. After approval the rest of the server opens up automatically.',
      '*Tip: if you were invited by someone, enter their recruiter code when asked.*',
    ].join('\n'),
  },
  welcome: {
    staff: false,
    title: '👋 Welcome channel',
    body: [
      'New members are greeted here, and goodbyes are posted here too.',
      '',
      '• Nothing needs to be done in this channel.',
      '• Read the rules, then say hello to the community.',
      '• Staff can change the welcome text and the channel any time in the dashboard (Welcome).',
    ].join('\n'),
  },
  review: {
    staff: true,
    title: '📥 Application reviews (staff only)',
    body: [
      'Every new application appears here with the applicant’s answers and screening result.',
      '',
      '**What to do**',
      '• Press **Approve** or **Reject**, or decide from the dashboard (both do the same thing).',
      '• A rejection asks for a reason, which is sent to the applicant.',
      '• Use the private staff thread on each application for discussion.',
      '',
      '**What happens on Approve:** the applicant gets the Member role (plus any extra roles you chose), the Applicant role is removed, they are messaged, and the decision is logged.',
    ].join('\n'),
  },
  recruitmentLog: {
    staff: true,
    title: '📋 Recruitment log (staff only)',
    body: [
      'A permanent record of the whole recruitment process. Nothing needs to be done here.',
      '',
      '• New applications, screening results and every decision (who decided, and why).',
      '• Recruiter credit when a new member joins with a code.',
      '• Secure Setup alerts, for example when a channel becomes visible to newcomers.',
    ].join('\n'),
  },
  serverLog: {
    staff: true,
    title: '🧾 Server log (staff only)',
    body: [
      'Keeps the server accountable. Nothing needs to be done here.',
      '',
      '• Joins and leaves, edited and deleted messages, role changes and warnings.',
      '• Use it to check what happened and when.',
    ].join('\n'),
  },
};
