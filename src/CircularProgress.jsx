import React from 'react';

export const CircularProgress = ({ progress, size = 64, strokeWidth = 6, colorClass = "text-blue-600" }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center drop-shadow-sm" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-gray-100" />
        <circle 
          cx={size/2} cy={size/2} r={radius} 
          stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" 
          strokeDasharray={circumference} strokeDashoffset={offset} 
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-1000 ease-out`} 
        />
      </svg>
      <span className="absolute text-[13px] font-extrabold text-gray-900 tracking-tighter">
        %{progress}
      </span>
    </div>
  );
};
