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
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Community Manager Icon"
    >
      <defs>
        <linearGradient id="cm_bg_grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F46E5" />
          <stop offset="1" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="cm_glow_grad" x1="16" y1="12" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A5B4FC" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      
      {/* Background squircle frame */}
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#cm_bg_grad)" />
      <rect x="2" y="2" width="44" height="44" rx="12" stroke="#6366F1" strokeWidth="1.5" strokeOpacity="0.4" />
      
      {/* Hexagonal orchestrator network */}
      <path
        d="M24 10L36 17V31L24 38L12 31V17L24 10Z"
        stroke="url(#cm_glow_grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Central network connections */}
      <path d="M24 10V24M36 31L24 24M12 31L24 24" stroke="#C7D2FE" strokeWidth="2" strokeLinecap="round" />
      
      {/* Central hub node */}
      <circle cx="24" cy="24" r="4" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="2" fill="#4F46E5" />
      
      {/* Perimeter nodes */}
      <circle cx="24" cy="10" r="2.5" fill="#C7D2FE" />
      <circle cx="36" cy="17" r="2.5" fill="#818CF8" />
      <circle cx="36" cy="31" r="2.5" fill="#818CF8" />
      <circle cx="24" cy="38" r="2.5" fill="#C7D2FE" />
      <circle cx="12" cy="31" r="2.5" fill="#818CF8" />
      <circle cx="12" cy="17" r="2.5" fill="#818CF8" />
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
