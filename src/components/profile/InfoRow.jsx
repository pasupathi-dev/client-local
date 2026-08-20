// Single data row inside a ProfileCard — .pp-info-row + .pp-info-icon + label/value.
// Pass the tint as {bg,fg} hex pair.
export default function InfoRow ({ icon, bg, fg, label, value, muted = false }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0">
      <div
        className="w-9 h-9 lg:w-10 lg:h-10 rounded-[var(--rs)] lg:rounded-[10px]
                   flex items-center justify-center text-[15px] lg:text-base shrink-0"
        style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.4px] text-muted">{label}</div>
        <div className={`text-sm lg:text-[15px] font-semibold truncate ${muted ? 'text-muted' : 'text-text'}`}>
          {value || '—'}
        </div>
      </div>
    </div>
  )
}
