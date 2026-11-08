import React, { useState, useEffect } from 'react';
import { ChannelSelect } from '../../common/DiscordPickers.js';
import {
  Calendar,
  Users,
  MapPin,
  Clock,
  Plus,
  Play,
  CheckCircle,
  Archive,
  XCircle,
  RotateCcw,
  Copy,
  Send,
  Pause,
  Repeat,
  Sparkles,
} from 'lucide-react';

interface EventsViewProps {
  communityId: string;
}

export const EventsView: React.FC<EventsViewProps> = ({ communityId }) => {
  const [activeTab, setActiveTab] = useState<'events' | 'schedules'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  // Event form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [timezone, setTimezone] = useState(
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC'
  );
  const [channelId, setChannelId] = useState('');
  const [capacity, setCapacity] = useState('50');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'COMMUNITY' | 'PRIVATE'>('COMMUNITY');

  // Schedule form state
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleResourceType, setScheduleResourceType] = useState<'EVENT' | 'CAMPAIGN' | 'ANNOUNCEMENT' | 'WORKFLOW'>('EVENT');
  const [scheduleResourceId, setScheduleResourceId] = useState('');
  const [scheduleRecurrence, setScheduleRecurrence] = useState<'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [scheduleNextExecution, setScheduleNextExecution] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/events', {
        headers: { 'x-community-id': communityId },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/v1/schedules', {
        headers: { 'x-community-id': communityId },
      });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchSchedules();
  }, [communityId]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !startAt || !endAt) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          title,
          description,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          timezone: timezone || 'UTC',
          channelId: channelId || undefined,
          capacity: parseInt(capacity, 10) || 50,
          registrationEnabled,
          visibility,
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setStartAt('');
        setEndAt('');
        setChannelId('');
        setCapacity('50');
        setSuccess('Event successfully created as DRAFT!');
        fetchEvents();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to create event.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error while creating event.');
    }
  };

  const handleEventAction = async (eventId: string, action: string, body?: any) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        setSuccess(`Event action "${action}" completed successfully.`);
        fetchEvents();
      } else {
        const err = await res.json();
        setError(err.message || `Failed to execute ${action}.`);
      }
    } catch (err: any) {
      setError(err.message || `Network error during ${action}.`);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleName || !scheduleResourceId || !scheduleNextExecution) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          name: scheduleName,
          resourceType: scheduleResourceType,
          resourceId: scheduleResourceId,
          timezone: timezone || 'UTC',
          recurrence: scheduleRecurrence,
          nextExecutionAt: new Date(scheduleNextExecution).toISOString(),
        }),
      });

      if (res.ok) {
        setScheduleName('');
        setScheduleResourceId('');
        setScheduleNextExecution('');
        setSuccess('Recurring schedule created successfully!');
        fetchSchedules();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to create schedule.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error creating schedule.');
    }
  };

  const handleScheduleAction = async (scheduleId: string, action: 'pause' | 'resume' | 'cancel') => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/schedules/${scheduleId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
      });

      if (res.ok) {
        setSuccess(`Schedule successfully marked as ${action}d.`);
        fetchSchedules();
      } else {
        const err = await res.json();
        setError(err.message || `Failed to ${action} schedule.`);
      }
    } catch (err: any) {
      setError(err.message || `Network error during schedule ${action}.`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'LIVE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse';
      case 'SCHEDULED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DRAFT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'COMPLETED':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'ARCHIVED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div id="events-automation-module" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              TASK 84 ENGINE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Events & Automation Engine
          </h1>
          <p className="text-sm text-slate-500">
            Authoritative lifecycle state management, recurrence scheduler, Discord event sync, and attendee rosters.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            id="tab-events-view"
            onClick={() => setActiveTab('events')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'events'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Events Lifecycle ({events.length})
          </button>
          <button
            id="tab-schedules-view"
            onClick={() => setActiveTab('schedules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'schedules'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            Recurring Schedules ({schedules.length})
          </button>
        </div>
      </div>

      {error && (
        <div id="events-error-banner" className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div id="events-success-banner" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          ✓ {success}
        </div>
      )}

      {activeTab === 'events' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Create Event Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" />
              Create Event
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Initializes event in draft state with timezone enforcement.</p>

            <form onSubmit={handleCreateEvent} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Title</label>
                <input
                  id="event-input-title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="E.g., Recruiter AMA & Workshop"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Discord Channel ID</label>
                <ChannelSelect className="mt-1" value={channelId} placeholder="Channel for the event notice (optional)" onChange={setChannelId} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Start Time</label>
                  <input
                    id="event-input-start"
                    type="datetime-local"
                    value={startAt}
                    onChange={e => setStartAt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">End Time</label>
                  <input
                    id="event-input-end"
                    type="datetime-local"
                    value={endAt}
                    onChange={e => setEndAt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Timezone (IANA)</label>
                  <input
                    id="event-input-timezone"
                    type="text"
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    placeholder="UTC, America/New_York"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Capacity</label>
                  <input
                    id="event-input-capacity"
                    type="number"
                    value={capacity}
                    onChange={e => setCapacity(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Description</label>
                <textarea
                  id="event-input-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Community event agenda and topics..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registrationEnabled}
                    onChange={e => setRegistrationEnabled(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Allow Registration</span>
                </label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as any)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="COMMUNITY">Members only</option>
                  <option value="PUBLIC">Everyone in the server</option>
                  <option value="PRIVATE">Private (staff add people)</option>
                </select>
              </div>
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-slate-600">
                {visibility === 'PRIVATE'
                  ? 'Not announced in Discord. Add people from the event’s attendee list.'
                  : 'When you publish, the bot posts this event in the chosen channel with Register and Can’t go buttons. People sign up right in Discord and get reminders 24h, 1h and 15 min before.'}
              </p>

              <button
                id="btn-create-event-submit"
                type="submit"
                className="w-full rounded-md bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
              >
                Create Event Draft
              </button>
            </form>
          </div>

          {/* Events List */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Events Directory</h3>
                <p className="text-xs text-slate-500">Manage state transitions and inspect member attendance.</p>
              </div>
              <button
                onClick={fetchEvents}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading events directory...</div>
              ) : events.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No community events created yet. Use the form to draft your first event.
                </div>
              ) : (
                events.map(ev => (
                  <div
                    key={ev.id}
                    id={`event-card-${ev.id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{ev.title}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${getStatusBadge(ev.status)}`}>
                          {ev.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ev.status === 'DRAFT' && (
                          <button
                            onClick={() => handleEventAction(ev.id, 'publish', { syncDiscord: true })}
                            className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 flex items-center gap-1"
                          >
                            <Send className="h-3 w-3" />
                            Publish
                          </button>
                        )}
                        {ev.status === 'SCHEDULED' && (
                          <>
                            <button
                              onClick={() => handleEventAction(ev.id, 'start')}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 flex items-center gap-1"
                            >
                              <Play className="h-3 w-3" />
                              Go Live
                            </button>
                            <button
                              onClick={() => handleEventAction(ev.id, 'unpublish')}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Unpublish
                            </button>
                          </>
                        )}
                        {ev.status === 'LIVE' && (
                          <button
                            onClick={() => handleEventAction(ev.id, 'complete')}
                            className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-900 flex items-center gap-1"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Complete
                          </button>
                        )}
                        {(ev.status === 'COMPLETED' || ev.status === 'CANCELLED') && (
                          <button
                            onClick={() => handleEventAction(ev.id, 'archive')}
                            className="rounded border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 flex items-center gap-1"
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </button>
                        )}
                        {ev.status !== 'CANCELLED' && ev.status !== 'COMPLETED' && ev.status !== 'ARCHIVED' && (
                          <button
                            onClick={() => handleEventAction(ev.id, 'cancel')}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 flex items-center gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleEventAction(ev.id, 'duplicate')}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                          title="Duplicate Event"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                      {ev.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(ev.startAt).toLocaleString()} ({ev.timezone || 'UTC'})
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        Capacity: {ev.maxParticipants || ev.capacity || 'Unlimited'}
                      </span>
                      {ev.channelId && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          Channel: {ev.channelId}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Schedules Tab */
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Create Schedule Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              New Recurring Schedule
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Automates event reminders, announcements, and maintenance triggers.</p>

            <form onSubmit={handleCreateSchedule} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Schedule Name</label>
                <input
                  id="sched-input-name"
                  type="text"
                  value={scheduleName}
                  onChange={e => setScheduleName(e.target.value)}
                  placeholder="E.g., Weekly Member Sync Timer"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Resource Type</label>
                  <select
                    value={scheduleResourceType}
                    onChange={e => setScheduleResourceType(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  >
                    <option value="EVENT">EVENT</option>
                    <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
                    <option value="CAMPAIGN">CAMPAIGN</option>
                    <option value="WORKFLOW">WORKFLOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Recurrence</label>
                  <select
                    value={scheduleRecurrence}
                    onChange={e => setScheduleRecurrence(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  >
                    <option value="DAILY">DAILY</option>
                    <option value="WEEKLY">WEEKLY</option>
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="ONCE">ONCE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Target Resource ID</label>
                <input
                  id="sched-input-resource-id"
                  type="text"
                  value={scheduleResourceId}
                  onChange={e => setScheduleResourceId(e.target.value)}
                  placeholder="ID of target event or workflow"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Next Execution Time</label>
                <input
                  id="sched-input-next-exec"
                  type="datetime-local"
                  value={scheduleNextExecution}
                  onChange={e => setScheduleNextExecution(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <button
                id="btn-create-schedule-submit"
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
              >
                Register Schedule
              </button>
            </form>
          </div>

          {/* Schedules List */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Active Schedules</h3>
                <p className="text-xs text-slate-500">Autonomous recurrence schedules registered in the durable engine.</p>
              </div>
              <button
                onClick={fetchSchedules}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {schedules.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No recurring schedules registered. Create one to automate event reminders or periodic workflows.
                </div>
              ) : (
                schedules.map(sc => (
                  <div
                    key={sc.id}
                    id={`schedule-card-${sc.id}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">{sc.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${
                          sc.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : sc.status === 'PAUSED'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {sc.status}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-mono text-slate-700">
                          {sc.recurrence}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Target: {sc.resourceType} ({sc.resourceId}) | Next: {new Date(sc.nextExecutionAt).toLocaleString()} ({sc.timezone})
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {sc.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleScheduleAction(sc.id, 'pause')}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 flex items-center gap-1"
                        >
                          <Pause className="h-3 w-3" />
                          Pause
                        </button>
                      )}
                      {sc.status === 'PAUSED' && (
                        <button
                          onClick={() => handleScheduleAction(sc.id, 'resume')}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </button>
                      )}
                      {sc.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleScheduleAction(sc.id, 'cancel')}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 flex items-center gap-1"
                        >
                          <XCircle className="h-3 w-3" />
                          Cancel
                        </button>
                      )}
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
