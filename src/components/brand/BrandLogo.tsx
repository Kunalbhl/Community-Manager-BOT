import React from 'react';

export interface BrandLogoProps {
  variant?: 'full' | 'compact' | 'icon';
  theme?: 'dark' | 'light' | 'auto';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = '',
}) => {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Community Manager">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stopColor="#1C2350" /><stop offset="1" stopColor="#0C1029" /></linearGradient>
        <linearGradient id={`rg${id}`} x1="96" y1="96" x2="416" y2="416" gradientUnits="userSpaceOnUse"><stop stopColor="#A7B0FF" /><stop offset=".55" stopColor="#7C8CFF" /><stop offset="1" stopColor="#FF5C8A" /></linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill={`url(#bg${id})`} />
      <path d="M256 92 L398 174 V338 L256 420 L114 338 V174 Z" fill="none" stroke={`url(#rg${id})`} strokeWidth="30" strokeLinejoin="round" />
      <g stroke="#E7E9FF" strokeWidth="18" strokeLinecap="round" opacity=".9">
        <line x1="256" y1="256" x2="256" y2="168" /><line x1="256" y1="256" x2="332" y2="300" /><line x1="256" y1="256" x2="180" y2="300" />
      </g>
      <circle cx="256" cy="160" r="30" fill="#A7B0FF" />
      <circle cx="340" cy="306" r="30" fill="#7C8CFF" />
      <circle cx="172" cy="306" r="30" fill="#7C8CFF" />
      <circle cx="256" cy="256" r="44" fill="#FF5C8A" />
      <circle cx="256" cy="256" r="18" fill="#0C1029" />
    </svg>
  );
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  theme = 'light',
  size = 'md',
  showSubtitle = true,
  subtitle = 'Operations & Intelligence Platform',
  className = '',
}) => {
  const pixelSizes = {
    xs: 20,
    sm: 28,
    md: 36,
    lg: 44,
    xl: 56,
  };

  const currentPx = pixelSizes[size];

  if (variant === 'icon') {
    return <BrandMark size={currentPx} className={className} />;
  }

  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark size={currentPx} />

      {variant !== 'compact' && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className={`font-extrabold tracking-tight ${
                size === 'lg' || size === 'xl' ? 'text-lg sm:text-xl' : 'text-sm font-bold'
              } ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              Community Manager
            </span>
          </div>

          {showSubtitle && (
            <span
              className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-indigo-300' : 'text-indigo-600'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
