// src/app/ratings/components/TeamLogo.tsx
'use client';

import React from 'react';

interface TeamLogoProps {
  teamName: string;
  logoUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showFallback?: boolean;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-16 h-16',
};

const fallbackTextSizes = {
  sm: 'text-xs',
  md: 'text-xs',
  lg: 'text-2xl',
};

export function TeamLogo({ 
  teamName, 
  logoUrl, 
  size = 'md', 
  className = '',
  showFallback = true 
}: TeamLogoProps) {
  const sizeClass = sizeClasses[size];
  const textSize = fallbackTextSizes[size];
  
  if (logoUrl) {
    return (
      <img 
        src={logoUrl} 
        alt={teamName}
        className={`${sizeClass} object-contain flex-shrink-0 ${className}`}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  
  if (!showFallback) {
    return null;
  }
  
  return (
    <div className={`${sizeClass} bg-gray-200 rounded-full flex items-center justify-center ${textSize} text-gray-900 flex-shrink-0 ${className}`}>
      {teamName.charAt(0)}
    </div>
  );
}
