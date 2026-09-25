import React from 'react';

export default function TraceLensLogo({ className = "h-8 w-8" }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 40 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="10" fill="#0D1117" stroke="#30363D" strokeWidth="1.5"/>
      <circle cx="18" cy="18" r="9" stroke="#38BDF8" strokeWidth="2" strokeDasharray="4 2"/>
      <circle cx="18" cy="18" r="4.5" fill="#38BDF8" fillOpacity="0.25" stroke="#38BDF8" strokeWidth="1.5"/>
      <circle cx="18" cy="18" r="2" fill="#38BDF8"/>
      <line x1="25" y1="25" x2="33" y2="33" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M7 32L14 32" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="28" cy="11" r="2" fill="#F43F5E"/>
    </svg>
  );
}
