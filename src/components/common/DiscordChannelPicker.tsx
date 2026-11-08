import React from 'react';
import { useDiscordResources } from './DiscordPickers.js';

interface DiscordChannelPickerProps {
  id?: string; guildId?: string; communityId?: string; value?: string;
  onChange: (channelId: string, channelName?: string) => void;
  textOnly?: boolean; required?: boolean; disabled?: boolean; placeholder?: string; label?: string;
  showPermissionBadges?: boolean; className?: string;
}

/** Live channel picker (works for every server the bot is in). Accepts a stored ID or name as value. */
export const DiscordChannelPicker: React.FC<DiscordChannelPickerProps> = ({ id, guildId, communityId, value, onChange, required, disabled, placeholder = 'Choose a channel', label, className = '' }) => {
  const res = useDiscordResources(communityId || (guildId ? `comm_${guildId}` : undefined));
  const list = res?.textChannels || [];
  const v = String(value || '').replace(/^#/, '');
  const match = list.find((c) => c.id === v || c.name === v);
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">{label}</label>}
      <select id={id} required={required} disabled={disabled} value={match?.id || ''}
        onChange={(e) => { const c = list.find((x) => x.id === e.target.value); onChange(c?.id || '', c?.name); }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none">
        <option value="">{res ? placeholder : 'Loading channels…'}</option>
        {value && !match && <option value="" disabled>{`#${v} (not found in server)`}</option>}
        {list.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
      </select>
    </div>
  );
};
export default DiscordChannelPicker;
