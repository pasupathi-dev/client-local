// .pnl-section-label — small uppercase group header above a menu list.
export default function SectionLabel ({ children, className = '' }) {
  return (
    <div className={`text-[10px] font-bold uppercase tracking-[1px] text-muted px-0.5 mt-4 mb-1.5 ${className}`}>
      {children}
    </div>
  )
}
