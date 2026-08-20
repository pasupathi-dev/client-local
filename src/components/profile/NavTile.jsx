// Menu tile — .pnl-item + .pnl-icon + .pnl-title + .pnl-sub + .pnl-arrow.
// `danger` turns the title red (Sign Out). `right` can override the default chevron.
export default function NavTile ({ icon, bg, fg, title, sub, onClick, danger = false, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-card border border-border rounded-[var(--r)] lg:rounded-2xl
                 px-[18px] py-3.5 lg:px-[22px] lg:py-[18px]
                 flex items-center gap-3 cursor-pointer text-left
                 hover:border-accent hover:shadow-[0_4px_12px_rgba(232,65,26,0.08)] transition">
      <div className="w-[38px] h-[38px] rounded-[var(--rs)] shrink-0
                      flex items-center justify-center text-[17px]"
           style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] lg:text-sm font-bold truncate
                         ${danger ? 'text-[#ef4444]' : 'text-text'}`}>
          {title}
        </div>
        {sub && <div className="text-[11px] text-muted mt-0.5 truncate">{sub}</div>}
      </div>
      {right !== undefined ? right : <span className="text-[15px] text-muted leading-none">›</span>}
    </button>
  )
}
