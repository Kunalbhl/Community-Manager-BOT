import React, { useEffect } from 'react';
import { usePublicContact } from './SiteChrome.js';

/** "/discord": sends visitors straight to the Development Area & Feedback invite. */
export function DiscordRedirect() {
  const c = usePublicContact();
  useEffect(() => {
    if (c?.invite) window.location.replace(c.invite);
    else if (c) window.location.replace('/contact');
  }, [c]);
  return (
    <div className="cm-site grid min-h-screen place-items-center">
      <p className="text-[var(--site-muted)]">Opening our Discord…</p>
    </div>
  );
}
