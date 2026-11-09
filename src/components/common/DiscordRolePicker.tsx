import React from 'react';
import { useDiscordResources, normName } from './DiscordPickers.js';

interface DiscordRolePickerProps {
  id?: string; guildId?: string; communityId?: string; value?: string;
  onChange: (roleId: string, roleName?: string) => void;
  unmanagedOnly?: boolean; includeEveryone?: boolean; required?: boolean; disabled?: boolean;
  placeholder?: string; label?: string; showHierarchyBadges?: boolean; className?: string;
}

/** Live role picker. Accepts a stored role ID or name as value. */
export const DiscordRolePicker: React.FC<DiscordRolePickerProps> = ({ id, guildId, communityId, value, onChange, required, disabled, placeholder = 'Choose a role', label, className = '' }) => {
  const res = useDiscordResources(communityId || (guildId ? `comm_${guildId}` : undefined));
  const list = res?.roles || [];
  const v = String(value || '').replace(/^@/, '');
  const match = list.find((r) => r.id === v || r.name === v) || list.find((r) => normName(r.name) === normName(v));
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">{label}</label>}
      <select id={id} required={required} disabled={disabled} value={match?.id || ''}
        onChange={(e) => { const r = list.find((x) => x.id === e.target.value); onChange(r?.id || '', r?.name); }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none">
        <option value="">{res ? placeholder : 'Loading roles…'}</option>
        {list.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
      </select>
    </div>
  );
};
export default DiscordRolePicker;
