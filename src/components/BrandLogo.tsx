import React from 'react';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ variant = 'dark', size = 'md' }) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : 'text-lg';
  const textColor = variant === 'light' ? 'text-white' : 'text-[#0B192C]';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg className={iconSize} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={variant === 'light' ? '#10243E' : '#0B192C'} />
        <path
          d="M15 39V32C15 24.82 20.82 19 28 19C32.4 19 36.28 21.19 38.63 24.54"
          stroke="#10B981"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M10.5 35.5L15 41L19.5 35.5"
          stroke="#10B981"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M49 25V32C49 39.18 43.18 45 36 45C31.6 45 27.72 42.81 25.37 39.46"
          stroke="#FFFFFF"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M44.5 28.5L49 23L53.5 28.5"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="32" r="3.5" fill="#10B981" />
      </svg>
      <span className={`font-display font-bold tracking-tight ${textSize} ${textColor}`}>
        CashBridge
      </span>
    </span>
  );
};
