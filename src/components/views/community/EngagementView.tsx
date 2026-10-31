import React, { useState, useEffect } from 'react';
import { Megaphone, MessageSquare, Send, Calendar, Clock, BarChart3, Plus, Volume2 } from 'lucide-react';

interface EngagementViewProps {
  communityId: string;
  initialTab?: 'announcements' | 'campaigns' | 'reminders' | 'polls' | 'templates';
}

export const EngagementView: React.FC<EngagementViewProps> = ({ communityId, initialTab = 'announcements' }) => {
  const [activeTab, setActiveTab] = useState<'announcements' | 'campaigns' | 'reminders' | 'polls' | 'templates'>(initialTab);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);

  // Announcement Form State
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annChannel, setAnnChannel] = useState('112233445566');
  const [annScheduledAt, setAnnScheduledAt] = useState('');

  // Campaign Form State
  const [campName, setCampName] = useState('');
  const [campAudience, setCampAudience] = useState<'ALL' | 'MEMBERS' | 'RECRUITERS' | 'APPLICANTS'>('ALL');
  const [campMessage, setCampMessage] = useState('');

  // Reminder Form State
  const [remUser, setRemUser] = useState('');
  const [remMessage, setRemMessage] = useState('');
  const [remTime, setRemTime] = useState('');

  // Poll Form State
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('');
  const [pollChannel, setPollChannel] = useState('112233445566');

  // Template Form State
  const [tempName, setTempName] = useState('');
  const [tempContent, setTempContent] = useState('');
  const [tempVariables, setTempVariables] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-community-id': communityId };
      const [annRes, campRes, remRes, pollRes, tempRes] = await Promise.all([
        fetch(`/api/v1/engagement/announcements?communityId=${encodeURIComponent(communityId)}`, { headers }),
        fetch(`/api/v1/engagement/campaigns?communityId=${encodeURIComponent(communityId)}`, { headers }),
        fetch(`/api/v1/engagement/reminders?communityId=${encodeURIComponent(communityId)}`, { headers }),
        fetch(`/api/v1/engagement/polls?communityId=${encodeURIComponent(communityId)}`, { headers }),
        fetch(`/api/v1/engagement/templates?communityId=${encodeURIComponent(communityId)}`, { headers }),
      ]);

      if (annRes.ok) {
        const d = await annRes.json();
        setAnnouncements(d.announcements || []);
      }
      if (campRes.ok) {
        const d = await campRes.json();
        setCampaigns(d.campaigns || []);
      }
      if (remRes.ok) {
        const d = await remRes.json();
        setReminders(d.reminders || []);
      }
      if (pollRes.ok) {
        const d = await pollRes.json();
        setPolls(d.polls || []);
      }
      if (tempRes.ok) {
        const d = await tempRes.json();
        setTemplates(d.templates || []);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch engagement data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId]);

  const triggerToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle || !annContent) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/engagement/announcements?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          title: annTitle,
          content: annContent,
          channelId: annChannel,
          scheduledAt: annScheduledAt ? new Date(annScheduledAt).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        setAnnTitle('');
        setAnnContent('');
        setAnnScheduledAt('');
        triggerToast('Announcement registered successfully!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Error dispatching announcement.');
      }
    } catch (err) {
      setError('Network failure dispatching announcement.');
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName || !campMessage) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/engagement/campaigns?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          name: campName,
          targetAudience: campAudience,
          message: campMessage,
        }),
      });
      if (res.ok) {
        setCampName('');
        setCampMessage('');
        triggerToast('Engagement campaign launched successfully!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Error launching campaign.');
      }
    } catch (err) {
      setError('Network failure launching campaign.');
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remUser || !remMessage || !remTime) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/engagement/reminders?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          triggerAt: new Date(remTime).toISOString(),
          targetUser: remUser,
          message: remMessage,
        }),
      });
      if (res.ok) {
        setRemUser('');
        setRemMessage('');
        setRemTime('');
        triggerToast('Reminder scheduled on Gateway!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Error creating reminder.');
      }
    } catch (err) {
      setError('Network failure creating reminder.');
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion || !pollOptions) return;
    setError(null);
    const optionsArray = pollOptions.split('\n').map(o => o.trim()).filter(Boolean);
    if (optionsArray.length < 2) {
      setError('Please provide at least 2 poll options.');
      return;
    }
    try {
      const res = await fetch(`/api/v1/engagement/polls?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          question: pollQuestion,
          options: optionsArray,
          channelId: pollChannel,
        }),
      });
      if (res.ok) {
        setPollQuestion('');
        setPollOptions('');
        triggerToast('Interactive poll deployed to Discord channel!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Error deploying poll.');
      }
    } catch (err) {
      setError('Network failure deploying poll.');
    }
  };

  const handleVote = async (pollId: string, optionIdx: number) => {
    try {
      const res = await fetch(`/api/v1/engagement/polls/${pollId}/vote?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ optionIndex: optionIdx }),
      });
      if (res.ok) {
        triggerToast('Vote cast successfully!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Already voted or poll is closed.');
      }
    } catch (err) {
      setError('Network failure casting vote.');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName || !tempContent) return;
    setError(null);
    const variablesArray = tempVariables.split(',').map(v => v.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/v1/engagement/templates?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          name: tempName,
          content: tempContent,
          variables: variablesArray,
        }),
      });
      if (res.ok) {
        setTempName('');
        setTempContent('');
        setTempVariables('');
        triggerToast('Message Template saved successfully!');
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Error saving template.');
      }
    } catch (err) {
      setError('Network failure saving template.');
    }
  };

  return (
    <div id="engagement-module" className="space-y-6">
      {/* Module Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              ENGAGEMENT MODULE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Interactive Engagement Manager
          </h1>
          <p className="text-sm text-slate-500">
            Build server trust and community activity via announcements, directed campaigns, and interactive polls.
          </p>
        </div>
      </div>

      {/* Notifications & Error Alerts */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 animate-pulse">
          ✅ {successMsg}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'announcements'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          Announcements
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'campaigns'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Volume2 className="h-4 w-4" />
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'reminders'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Clock className="h-4 w-4" />
          Reminders
        </button>
        <button
          onClick={() => setActiveTab('polls')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'polls'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Interactive Polls
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === 'templates'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Message Templates
        </button>
      </div>

      {loading && <div className="text-center py-6 text-sm text-slate-400">Loading engagement dashboard...</div>}

      {/* TAB CONTENT: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Dispatch Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Send className="h-4 w-4 text-indigo-600" />
              Dispatch Announcement
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Send a targeted webhook message to text channels.</p>
            <form onSubmit={handleCreateAnnouncement} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Title</label>
                <input
                  type="text"
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  placeholder="E.g., Server Onboarding Complete!"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Channel ID</label>
                <input
                  type="text"
                  value={annChannel}
                  onChange={e => setAnnChannel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Content</label>
                <textarea
                  value={annContent}
                  onChange={e => setAnnContent(e.target.value)}
                  placeholder="Markdown announcements content..."
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Schedule Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={annScheduledAt}
                  onChange={e => setAnnScheduledAt(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave empty to send immediately to Discord.</p>
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 font-semibold"
              >
                {annScheduledAt ? 'Schedule Announcement' : 'Send Instantly to Discord'}
              </button>
            </form>
          </div>

          {/* List */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <h3 className="font-bold text-slate-900">Announcement Log</h3>
            <p className="text-xs text-slate-500">Live feed of processed and scheduled announcements.</p>
            <div className="mt-4 space-y-3">
              {announcements.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No announcements found. Dispatch your first!</div>
              ) : (
                announcements.map((a: any) => (
                  <div key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{a.title}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        a.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {a.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 font-mono bg-white p-2.5 rounded border border-slate-100 whitespace-pre-wrap">{a.content}</p>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>Channel: {a.channelId}</span>
                      <span>Dispatched At: {new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CAMPAIGNS */}
      {activeTab === 'campaigns' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900">Create Targeted Campaign</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send private messages to active community segments.</p>
            <form onSubmit={handleCreateCampaign} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Campaign Name</label>
                <input
                  type="text"
                  value={campName}
                  onChange={e => setCampName(e.target.value)}
                  placeholder="Weekly Leaderboard Sprint"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Target Audience</label>
                <select
                  value={campAudience}
                  onChange={e => setCampAudience(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                >
                  <option value="ALL">All Active Members</option>
                  <option value="RECRUITERS">Authorized Recruiters Only</option>
                  <option value="APPLICANTS">Pending Applicants</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Message</label>
                <textarea
                  value={campMessage}
                  onChange={e => setCampMessage(e.target.value)}
                  rows={4}
                  placeholder="Hey, recruiters!..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Launch Campaign
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <h3 className="font-bold text-slate-900">Active Engagement Campaigns</h3>
            <div className="mt-4 space-y-3">
              {campaigns.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No active campaigns configured. Create one to bolster your community activity!</div>
              ) : (
                campaigns.map((c: any) => (
                  <div key={c.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{c.name}</span>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                        Target: {c.targetAudience}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 whitespace-pre-wrap font-mono bg-white p-2.5 rounded border border-slate-100">{c.message}</p>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>Status: {c.status}</span>
                      <span>Launched: {new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900">Schedule Gateway Reminder</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send a timed notification to a specific Discord ID or Username.</p>
            <form onSubmit={handleCreateReminder} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Target User (Discord ID/Username)</label>
                <input
                  type="text"
                  value={remUser}
                  onChange={e => setRemUser(e.target.value)}
                  placeholder="345678912345"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Trigger Time</label>
                <input
                  type="datetime-local"
                  value={remTime}
                  onChange={e => setRemTime(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Reminder Message</label>
                <textarea
                  value={remMessage}
                  onChange={e => setRemMessage(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Schedule Reminder
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <h3 className="font-bold text-slate-900">Scheduled Reminders List</h3>
            <div className="mt-4 space-y-3">
              {reminders.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No scheduled reminders found. Create one above.</div>
              ) : (
                reminders.map((r: any) => (
                  <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">Target User: {r.targetUser}</span>
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 font-mono">
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-100">{r.message}</p>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>Trigger: {new Date(r.triggerAt).toLocaleString()}</span>
                      <span>Created: {new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: POLLS */}
      {activeTab === 'polls' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900">Launch Live Discord Poll</h3>
            <p className="text-xs text-slate-500 mt-0.5">Deploy real-time multiple choice polling to text channels.</p>
            <form onSubmit={handleCreatePoll} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Question</label>
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="What time should we run our next event?"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Channel ID</label>
                <input
                  type="text"
                  value={pollChannel}
                  onChange={e => setPollChannel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Options (one option per line)</label>
                <textarea
                  value={pollOptions}
                  onChange={e => setPollOptions(e.target.value)}
                  rows={4}
                  placeholder="Option A&#10;Option B&#10;Option C"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Deploy Poll to Discord
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <h3 className="font-bold text-slate-900">Live Discord Polls</h3>
            <div className="mt-4 space-y-4">
              {polls.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No active polls found. Deploy your first to collect member feedback!</div>
              ) : (
                polls.map((p: any) => {
                  const totalVotes = Object.values(p.votes).reduce((a: any, b: any) => a + b, 0) as number;
                  return (
                    <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-sm font-bold text-slate-900">🗳️ {p.question}</span>
                        <span className="rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 text-[10px]">
                          {p.status}
                        </span>
                      </div>
                      <div className="mt-4 space-y-3">
                        {p.options.map((opt: string, idx: number) => {
                          const votesCount = p.votes[idx.toString()] || 0;
                          const pct = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">{opt}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-mono font-bold">{votesCount} votes ({pct}%)</span>
                                  <button
                                    onClick={() => handleVote(p.id, idx)}
                                    className="rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold px-2 py-0.5"
                                  >
                                    Vote
                                  </button>
                                </div>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                        <span>Channel: {p.channelId}</span>
                        <span>Total Votes Cast: {totalVotes}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MESSAGE TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900">Create Message Template</h3>
            <p className="text-xs text-slate-500 mt-0.5">Define reusable text blocks with variable mappings for quick Discord execution.</p>
            <form onSubmit={handleCreateTemplate} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Template Name</label>
                <input
                  type="text"
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  placeholder="Welcome Message, Verification Instructions..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Variables (comma-separated)</label>
                <input
                  type="text"
                  value={tempVariables}
                  onChange={e => setTempVariables(e.target.value)}
                  placeholder="username, communityName, inviteCode"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">Specify keywords to automatically substitute during delivery.</p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Template Content</label>
                <textarea
                  value={tempContent}
                  onChange={e => setTempContent(e.target.value)}
                  rows={6}
                  placeholder="Hello {{username}}! Welcome to {{communityName}}! Use code {{inviteCode}} to verify your role."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Save Template
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2">
            <h3 className="font-bold text-slate-900">Saved Message Templates</h3>
            <div className="mt-4 space-y-4">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No message templates saved yet. Create one to standardise your server notifications.</div>
              ) : (
                templates.map((t: any) => (
                  <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-sm font-bold text-slate-900">📝 {t.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {t.id}</span>
                    </div>
                    {t.variables && t.variables.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Mapped Variables:</span>
                        {t.variables.map((v: string) => (
                          <span key={v} className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 font-mono">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Content Preview:</span>
                      <p className="mt-1 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-150 whitespace-pre-wrap font-mono">
                        {t.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
