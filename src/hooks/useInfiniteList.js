// Shared infinite-scroll list hook. One fetch function + a set of filter
// params in, and you get:
//   { items, total, loading, loadingMore, sentinelRef }
//
// Whenever `params` changes (by *value* — pass a stable object from useMemo
// or a primitive-serialisation key) the list resets to offset 0. When the
// sentinel scrolls into view, the next page is fetched and appended with
// a dedup pass on `keyFn`.

import { useEffect, useMemo, useRef, useState } from 'react'

export default function useInfiniteList ({
  fetchPage,               // async ({ limit, offset, ...params }) -> { rows, total }
  params,                  // filter object — value-based identity via paramsKey
  paramsKey,               // stable string key for params (easier than deepEq)
  pageSize = 10,
  keyFn = (x) => x.id,
  rootMargin = '160px',
  resetSignal,             // bump this to force a reset/refetch
}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)
  const reqSeq      = useRef(0)

  // Serialise params for identity comparison — cheaper than deepEq and the
  // params are all primitives here (strings, numbers, ISO dates).
  const key = useMemo(
    () => paramsKey ?? JSON.stringify(params || {}),
    [paramsKey, params],
  )

  // First page — refires whenever the filter key changes.
  useEffect(() => {
    const id = ++reqSeq.current
    setLoading(true); setLoadingMore(false)
    Promise.resolve(fetchPage({ ...(params || {}), limit: pageSize, offset: 0 }))
      .then((r) => {
        if (id !== reqSeq.current) return
        setItems(r?.rows || [])
        setTotal(Number(r?.total || 0))
      })
      .catch(() => {
        if (id !== reqSeq.current) return
        setItems([]); setTotal(0)
      })
      .finally(() => { if (id === reqSeq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resetSignal])

  const hasMore = items.length < total

  // Sentinel fetches the next page on viewport intersection.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      if (loading || loadingMore) return
      const id = reqSeq.current
      setLoadingMore(true)
      Promise.resolve(fetchPage({
        ...(params || {}), limit: pageSize, offset: items.length,
      }))
        .then((r) => {
          if (id !== reqSeq.current) return
          setItems((prev) => {
            const seen = new Set(prev.map(keyFn))
            return [...prev, ...(r?.rows || []).filter((x) => !seen.has(keyFn(x)))]
          })
          setTotal(Number(r?.total || 0))
        })
        .catch(() => {})
        .finally(() => {
          if (id === reqSeq.current) setLoadingMore(false)
        })
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, items.length, key])

  return { items, total, loading, loadingMore, sentinelRef, hasMore }
}
