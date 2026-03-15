function LoadingSpinner({ className = 'h-4 w-4', ariaHidden = true }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      style={{ animationDuration: '800ms' }}
      fill="none"
      aria-hidden={ariaHidden}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default LoadingSpinner
