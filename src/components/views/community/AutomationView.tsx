import React, { useState, useEffect } from 'react';
import { ChannelSelect, RoleSelect, MemberSelect } from '../../common/DiscordPickers.js';
import {
  Cpu,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  Terminal,
  RefreshCw,
  Sliders,
  Zap,
  Info,
  ChevronRight,
  Clock,
  Shield,
  MessageSquare,
  UserCheck,
  Calendar,
} from 'lucide-react';

interface AutomationViewProps {
  communityId: string;
}

interface TriggerDef {
  type: string;
  name: string;
  description: string;
}

interface ConditionDef {
  field: string;
  name: string;
  type: string;
  operators: string[];
}

interface ActionDef {
  type: string;
  name: string;
  description: string;
  configSchema: Record<string, string>;
}

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ActionRow {
  type: string;
  config: Record<string, any>;
}

export const AutomationView: React.FC<AutomationViewProps> = ({ communityId }) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [registries, setRegistries] = useState<{
    triggers: TriggerDef[];
    conditions: ConditionDef[];
    actions: ActionDef[];
  }>({
    triggers: [],
    conditions: [],
    actions: [],
  });

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState('');
  const [conditionGroup, setConditionGroup] = useState<'ALL' | 'ANY'>('ALL');
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([
    { type: 'SEND_DISCORD_MESSAGE', config: { channelId: '112233445566', messageTemplate: 'Welcome {{username}} to our server!' } },
  ]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Test Runner State
  const [testingWorkflowId, setTestingWorkflowId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Execution Drawer State
  const [selectedExecution, setSelectedExecution] = useState<any | null>(null);

  const fetchRegistries = async () => {
    try {
      const res = await fetch('/api/v1/automation/registries', {
        headers: { 'x-community-id': communityId },
      });
      if (res.ok) {
        const data = await res.json();
        setRegistries({
          triggers: data.triggers || [],
          conditions: data.conditions || [],
          actions: data.actions || [],
        });
        if (data.triggers?.length && !selectedTrigger) {
          setSelectedTrigger(data.triggers[0].type);
        }
      }
    } catch (err) {
      console.error('Failed to load registries:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [wfRes, execRes] = await Promise.all([
        fetch('/api/v1/automation/workflows', {
          headers: { 'x-community-id': communityId },
        }),
        fetch('/api/v1/automation/executions', {
          headers: { 'x-community-id': communityId },
        }),
      ]);

      if (wfRes.ok) {
        const d = await wfRes.json();
        setWorkflows(d.workflows || []);
      }
      if (execRes.ok) {
        const d = await execRes.json();
        setExecutions(d.executions || []);
      }
    } catch (err) {
      console.error('Error fetching workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistries();
    fetchData();
  }, [communityId]);

  const handleAddCondition = () => {
    const defaultField = registries.conditions[0]?.field || 'metadata.username';
    const defaultOp = registries.conditions[0]?.operators[0] || 'EQUALS';
    setConditions([...conditions, { field: defaultField, operator: defaultOp, value: '' }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, key: keyof ConditionRow, val: string) => {
    const updated = [...conditions];
    updated[index][key] = val;
    if (key === 'field') {
      const def = registries.conditions.find(c => c.field === val);
      if (def && def.operators.length > 0) {
        updated[index].operator = def.operators[0];
      }
    }
    setConditions(updated);
  };

  const handleAddAction = () => {
    const defaultActionType = registries.actions[0]?.type || 'SEND_DISCORD_MESSAGE';
    setActions([...actions, { type: defaultActionType, config: { channelId: '', messageTemplate: '' } }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionTypeChange = (index: number, type: string) => {
    const updated = [...actions];
    updated[index].type = type;
    if (type === 'SEND_DISCORD_MESSAGE') {
      updated[index].config = { channelId: '', messageTemplate: 'Hello {{username}}!' };
    } else if (type === 'ASSIGN_DISCORD_ROLE' || type === 'REMOVE_DISCORD_ROLE') {
      updated[index].config = { roleId: '', discordUserId: '' };
    } else if (type === 'CREATE_WARNING') {
      updated[index].config = { reason: 'Automated policy warning', severity: 'MEDIUM' };
    } else if (type === 'ADD_BLACKLIST') {
      updated[index].config = { reason: 'Automated violation blacklist' };
    } else if (type === 'SEND_EVENT_REMINDER') {
      updated[index].config = { eventId: '', channelId: '' };
    }
    setActions(updated);
  };

  const handleActionConfigChange = (index: number, key: string, val: any) => {
    const updated = [...actions];
    updated[index].config = { ...updated[index].config, [key]: val };
    setActions(updated);
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a workflow name.');
      return;
    }
    if (actions.length === 0) {
      setError('Please add at least one action.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/automation/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          triggerType: selectedTrigger,
          trigger: { type: selectedTrigger },
          conditions,
          conditionGroup,
          actions,
          status: 'ACTIVE',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setName('');
        setDescription('');
        setConditions([]);
        setSuccess(`Workflow "${data.workflow.name}" created successfully!`);
        fetchData();
      } else {
        setError(data.message || 'Error creating workflow.');
      }
    } catch (err: any) {
      setError(err.message || 'Network failure creating workflow.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    setError(null);
    setSuccess(null);
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/v1/automation/workflows/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSuccess(`Workflow status updated to ${newStatus}.`);
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Error toggling workflow status.');
      }
    } catch (err) {
      setError('Network failure toggling workflow.');
    }
  };

  const handleDeleteWorkflow = async (id: string, wfName: string) => {
    if (!confirm(`Are you sure you want to delete workflow "${wfName}"?`)) return;
    try {
      const res = await fetch(`/api/v1/automation/workflows/${id}`, {
        method: 'DELETE',
        headers: { 'x-community-id': communityId },
      });
      if (res.ok) {
        setSuccess(`Workflow "${wfName}" deleted.`);
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to delete workflow.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete workflow.');
    }
  };

  const handleTestWorkflow = async (wf: any) => {
    setTestingWorkflowId(wf.id);
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/v1/automation/workflows/${wf.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          testEvent: {
            eventId: `sim_${Date.now()}`,
            eventType: wf.triggerType,
            communityId,
            occurredAt: new Date().toISOString(),
            actorDiscordUserId: 'sim_tester_001',
            metadata: {
              username: 'SimulatedCandidate',
              displayName: 'Simulated Candidate',
              roles: ['11223344'],
              recruiterCode: 'TRUSTVIP',
              status: 'APPROVED',
              title: 'Community Townhall',
            },
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult(data.execution);
        fetchData(); // refresh execution list
      } else {
        setError(data.message || 'Simulation test failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run test');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div id="automation-module" className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              AUTOMATION & WORKFLOW ENGINE v2
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Event-Driven Automation Workflows
          </h1>
          <p className="text-sm text-slate-500">
            Durable database locks, multi-criteria conditions, Discord gateway bus triggers, and instant simulation sandbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 text-sm">×</button>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800 text-sm">×</button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Create Workflow Builder (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-indigo-600" />
              Configure Workflow
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set trigger events, filter logic, and automated action tasks.
            </p>

            <form onSubmit={handleCreateWorkflow} className="mt-4 space-y-4">
              {/* Name & Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Workflow Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Welcome New Guild Members"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g., Sends onboarding DM and tags role"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Event Trigger</label>
                <select
                  value={selectedTrigger}
                  onChange={e => setSelectedTrigger(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-slate-50"
                >
                  {registries.triggers.map(t => (
                    <option key={t.type} value={t.type}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {registries.triggers.find(t => t.type === selectedTrigger)?.description}
                </p>
              </div>

              {/* Conditions */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Conditions</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={conditionGroup}
                      onChange={e => setConditionGroup(e.target.value as any)}
                      className="rounded border border-slate-200 px-2 py-0.5 text-[10px] bg-slate-50 font-bold"
                    >
                      <option value="ALL">Match ALL (AND)</option>
                      <option value="ANY">Match ANY (OR)</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddCondition}
                      className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:text-indigo-800"
                    >
                      <Plus className="h-3 w-3" /> Add Rule
                    </button>
                  </div>
                </div>

                {conditions.length === 0 ? (
                  <div className="mt-2 text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded border border-dashed border-slate-200">
                    No conditions configured. Trigger will execute unconditionally on all events.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {conditions.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200 text-xs">
                        <select
                          value={c.field}
                          onChange={e => handleConditionChange(i, 'field', e.target.value)}
                          className="w-1/3 rounded border border-slate-300 px-2 py-1 text-[11px]"
                        >
                          {registries.conditions.map(cd => (
                            <option key={cd.field} value={cd.field}>
                              {cd.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.operator}
                          onChange={e => handleConditionChange(i, 'operator', e.target.value)}
                          className="w-1/3 rounded border border-slate-300 px-2 py-1 text-[11px]"
                        >
                          {(registries.conditions.find(cd => cd.field === c.field)?.operators || ['EQUALS']).map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={c.value}
                          onChange={e => handleConditionChange(i, 'value', e.target.value)}
                          placeholder="value"
                          className="w-1/3 rounded border border-slate-300 px-2 py-1 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCondition(i)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Actions</label>
                  <button
                    type="button"
                    onClick={handleAddAction}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:text-indigo-800"
                  >
                    <Plus className="h-3 w-3" /> Add Action
                  </button>
                </div>

                <div className="mt-2 space-y-3">
                  {actions.map((act, i) => (
                    <div key={i} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <select
                          value={act.type}
                          onChange={e => handleActionTypeChange(i, e.target.value)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold bg-white"
                        >
                          {registries.actions.map(a => (
                            <option key={a.type} value={a.type}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {actions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAction(i)}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Custom inputs based on action type */}
                      {act.type === 'SEND_DISCORD_MESSAGE' && (
                        <div className="space-y-1.5">
                          <ChannelSelect value={act.config.channelId || ''} placeholder="Choose a channel (empty = DM)" onChange={(v) => handleActionConfigChange(i, 'channelId', v)} />
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`dm-${i}`}
                              checked={!!act.config.sendAsDM}
                              onChange={e => handleActionConfigChange(i, 'sendAsDM', e.target.checked)}
                            />
                            <label htmlFor={`dm-${i}`} className="text-[11px] text-slate-700">Send as Direct Message to member</label>
                          </div>
                          <textarea
                            placeholder="Message Template (supports {{username}}, {{displayName}}, {{status}})"
                            rows={2}
                            value={act.config.messageTemplate || ''}
                            onChange={e => handleActionConfigChange(i, 'messageTemplate', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] font-mono"
                          />
                        </div>
                      )}

                      {(act.type === 'ASSIGN_DISCORD_ROLE' || act.type === 'REMOVE_DISCORD_ROLE') && (
                        <div className="space-y-1.5">
                          <RoleSelect value={act.config.roleId || ''} onChange={(v) => handleActionConfigChange(i, 'roleId', v)} />
                          <MemberSelect value={act.config.discordUserId || ''} placeholder="Target member (optional, defaults to the member who triggered it)" onChange={(id) => handleActionConfigChange(i, 'discordUserId', id)} />
                        </div>
                      )}

                      {act.type === 'CREATE_WARNING' && (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            placeholder="Reason for warning"
                            value={act.config.reason || ''}
                            onChange={e => handleActionConfigChange(i, 'reason', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                          />
                          <select
                            value={act.config.severity || 'MEDIUM'}
                            onChange={e => handleActionConfigChange(i, 'severity', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                          >
                            <option value="LOW">LOW Severity</option>
                            <option value="MEDIUM">MEDIUM Severity</option>
                            <option value="HIGH">HIGH Severity</option>
                          </select>
                        </div>
                      )}

                      {act.type === 'ADD_BLACKLIST' && (
                        <div>
                          <input
                            type="text"
                            placeholder="Reason for blacklisting"
                            value={act.config.reason || ''}
                            onChange={e => handleActionConfigChange(i, 'reason', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                          />
                        </div>
                      )}

                      {act.type === 'SEND_EVENT_REMINDER' && (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            placeholder="Event ID"
                            value={act.config.eventId || ''}
                            onChange={e => handleActionConfigChange(i, 'eventId', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                          />
                          <ChannelSelect value={act.config.channelId || ''} placeholder="Choose a channel (empty = DM)" onChange={(v) => handleActionConfigChange(i, 'channelId', v)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {submitting ? 'Creating Workflow...' : 'Deploy Automation Workflow'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Active Workflows & Live Execution Audit Logs (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Workflows List */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Active Workflows ({workflows.length})</h2>
                <p className="text-xs text-slate-500">Live workflows listening for trigger events.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {workflows.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No automation workflows deployed yet. Create your first one on the left.
                </div>
              ) : (
                workflows.map((wf: any) => (
                  <div
                    key={wf.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 transition hover:border-indigo-200"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{wf.name}</span>
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 font-mono">
                            v{wf.version || 1}
                          </span>
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 font-mono">
                            {wf.triggerType || wf.trigger?.type}
                          </span>
                        </div>
                        {wf.description && (
                          <p className="text-[11px] text-slate-500 mt-1">{wf.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          <span>
                            <strong>Conditions:</strong> {wf.conditions?.length || 0} ({wf.conditionGroup || 'ALL'})
                          </span>
                          <span>•</span>
                          <span>
                            <strong>Actions:</strong> {wf.actions?.length || 0}
                          </span>
                          {wf.lastExecutionAt && (
                            <>
                              <span>•</span>
                              <span>Last run: {new Date(wf.lastExecutionAt).toLocaleTimeString()}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Simulation Test Button */}
                        <button
                          onClick={() => handleTestWorkflow(wf)}
                          disabled={isTesting && testingWorkflowId === wf.id}
                          className="flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition"
                          title="Run simulated trigger event"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          {isTesting && testingWorkflowId === wf.id ? 'Testing...' : 'Test Run'}
                        </button>

                        {/* Status Toggle */}
                        <button
                          onClick={() => handleToggleStatus(wf.id, wf.status)}
                          className="text-slate-500 hover:text-indigo-600 transition"
                          title="Toggle Active / Paused"
                        >
                          {wf.status === 'ACTIVE' ? (
                            <ToggleRight className="h-6 w-6 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-slate-400" />
                          )}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteWorkflow(wf.id, wf.name)}
                          className="text-slate-400 hover:text-rose-600 transition"
                          title="Delete workflow"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Test Execution Simulation Result Modal / Banner */}
          {testResult && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-900">Simulation Run Output</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      testResult.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : testResult.status === 'SKIPPED'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {testResult.status}
                  </span>
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Dismiss
                </button>
              </div>

              <div className="mt-3 space-y-1 font-mono text-[11px] bg-slate-950 text-slate-200 p-3 rounded-lg overflow-x-auto max-h-48">
                {testResult.auditTrail?.map((line: string, idx: number) => (
                  <div key={idx} className="text-slate-300">
                    &gt; {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution History & Audit Logs */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                  <Terminal className="h-4 w-4 text-slate-600" />
                  Execution Audit Logs ({executions.length})
                </h2>
                <p className="text-xs text-slate-500">Live ledger of workflow dispatches with step audit trails.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {executions.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No executions recorded yet. Triggers fire automatically upon events.
                </div>
              ) : (
                executions.slice(0, 10).map((ex: any) => (
                  <div
                    key={ex.id}
                    onClick={() => setSelectedExecution(selectedExecution?.id === ex.id ? null : ex)}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs transition hover:border-slate-300 hover:bg-slate-100/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ex.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : ex.status === 'SKIPPED' ? (
                          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}
                        <span className="font-bold text-slate-800">{ex.triggerType}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {ex.id.substring(0, 12)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span>{ex.durationMs || 0}ms</span>
                        <span>{new Date(ex.executedAt || ex.createdAt).toLocaleTimeString()}</span>
                        <ChevronRight className={`h-3.5 w-3.5 transform transition-transform ${selectedExecution?.id === ex.id ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* Collapsible Step-by-step Audit Trail */}
                    {selectedExecution?.id === ex.id && (
                      <div className="mt-3 border-t border-slate-200 pt-2 font-mono text-[10px] bg-slate-900 text-slate-200 p-2.5 rounded">
                        <div className="text-emerald-400 font-bold mb-1">// Workflow Execution Trail:</div>
                        {ex.auditTrail?.map((line: string, i: number) => (
                          <div key={i} className="text-slate-300">&gt; {line}</div>
                        ))}
                        {ex.errorDetails && (
                          <div className="text-rose-400 mt-1">Error: {ex.errorDetails}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
