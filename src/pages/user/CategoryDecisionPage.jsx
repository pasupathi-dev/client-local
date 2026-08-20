// WorkDecisionPage — the /work/:name route. The decision logic + UI now lives
// in the shared <WorkDecisionView> (also used inline by the home-page popup),
// so this page is a thin wrapper that supplies the route param + page chrome.

import { useNavigate, useParams } from 'react-router-dom'
import WorkDecisionView from '@/components/WorkDecisionView'

export default function CategoryDecisionPage () {
  const { name } = useParams()
  const nav      = useNavigate()
  const work     = decodeURIComponent(name || '')

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[820px] mx-auto px-4 md:px-6 py-5 md:py-7">
        <WorkDecisionView work={work} onBack={() => nav(-1)} />
      </div>
    </div>
  )
}
