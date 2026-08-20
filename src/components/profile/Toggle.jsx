// Switch toggle — small (44×24) version reused on settings + partner onboarding.
export default function Toggle ({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors
                  ${on ? 'bg-accent' : 'bg-border'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white
                        shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-[left]
                        ${on ? 'left-[calc(100%-22px)]' : 'left-0.5'}`} />
    </button>
  )
}
