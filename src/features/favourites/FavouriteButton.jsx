// Star toggle for partner cards + detail page (M21). Renders a filled
// star when the partner is saved, hollow otherwise. Optimistic — clicks
// flip immediately and the API call lands in the background.

import { useDispatch, useSelector } from 'react-redux'
import {
  toggleFavourite, _optimisticFlip, selectFavouriteIds,
} from './favouritesSlice'

export default function FavouriteButton ({ partnerId, size = 18, stopProp = true, className = '' }) {
  const dispatch = useDispatch()
  const ids       = useSelector(selectFavouriteIds)
  const on        = !!ids[partnerId]

  const onClick = (e) => {
    if (stopProp) { e.preventDefault(); e.stopPropagation() }
    if (!partnerId) return
    // Optimistic flip first so the icon reacts before the network round-trip.
    dispatch(_optimisticFlip({ partner_id: partnerId, next: !on }))
    dispatch(toggleFavourite({ partner_id: partnerId, currentlyFavourited: on }))
  }

  return (
    <button type="button" onClick={onClick}
      aria-label={on ? 'Remove from favourites' : 'Save partner'}
      aria-pressed={on}
      style={{ fontSize: size }}
      className={`leading-none transition-colors
                  ${on ? 'text-yellow-500' : 'text-muted hover:text-yellow-500'}
                  ${className}`}>
      {on ? '★' : '☆'}
    </button>
  )
}
