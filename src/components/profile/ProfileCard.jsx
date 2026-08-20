// Reusable profile card — matches .pp-card + .pp-card-head + .pp-card-body from local.html.
export default function ProfileCard ({ icon, title, children, padBody = true, bodyClass = '' }) {
  return (
    <div className="bg-card border-[1.5px] border-border rounded-[var(--r)] lg:rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] py-3.5 md:py-4 lg:px-6 lg:py-[18px] border-b border-border">
        {icon && <span className="text-[15px] lg:text-base leading-none">{icon}</span>}
        <span className="font-display font-bold text-[13px] lg:text-[14px] text-text">{title}</span>
      </div>
      <div className={`${padBody ? 'px-[18px] py-3.5 md:py-4 lg:px-6 lg:py-[18px]' : ''} ${bodyClass}`}>
        {children}
      </div>
    </div>
  )
}
