import React from 'react';

export const ThreadlyHexIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 24,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="threadlyBrandGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="55%" stopColor="#DC2626" />
        <stop offset="100%" stopColor="#991B1B" />
      </linearGradient>
    </defs>
    {/* Modern Squircle Badge with Subtle Inner Hairline */}
    <rect x="2" y="2" width="28" height="28" rx="8.5" fill="url(#threadlyBrandGrad)" />
    <rect
      x="2.75"
      y="2.75"
      width="26.5"
      height="26.5"
      rx="7.75"
      stroke="white"
      strokeOpacity="0.22"
      strokeWidth="1"
    />
    {/* Interwoven Thread Loop + Geometric 'T' Monogram */}
    <path
      d="M8.5 10.5H23.5M16 10.5V22.5C16 23.6046 15.1046 24.5 14 24.5C12.8954 24.5 12 23.6046 12 22.5V17.5C12 15.8431 13.3431 14.5 15 14.5H20.5"
      stroke="white"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Accent Collaboration Node */}
    <circle cx="22" cy="14.5" r="2" fill="#FECACA" />
  </svg>
);

export const ThreadlyAnalyticsIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="28" height="28" rx="8.5" fill="#FEF2F2" stroke="#FECACA" strokeWidth="1.5" />
    <path
      d="M9 21V15M14 21V11M19 21V13.5M23 21V9"
      stroke="#DC2626"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <circle cx="23" cy="9" r="2" fill="#991B1B" />
  </svg>
);
