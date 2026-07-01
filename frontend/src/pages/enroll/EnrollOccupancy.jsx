import { useState, useEffect } from 'react'
import { Avatar, Spinner } from '../../components/UI'
import { getOccupancy } from '../../api/client'
import { fmtTime } from '../../utils'

export default function EnrollOccupancy() {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOccupancy()
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>

  const roomMap = {}
  rows.forEach(r => {
    if (!roomMap[r.room_id]) roomMap[r.room_id] = []
    roomMap[r.room_id].push(r)
  })

  const floors = [2, 3, 4, 5, 6, 7]
  const durText = h => h < 1 ? `${Math.round(h * 60)}m` : `${Number(h).toFixed(1)}h`
  const durColor = h => h > 8 ? 'var(--alm)' : h > 4 ? 'var(--am)' : 'var(--in)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {floors.map(f => (
        <div key={f} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 12, alignItems: 'start' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--tlo)', paddingTop: 14 }}>Tầng {f}</div>
          {[`P.${f}01`, `P.${f}02`].map(rk => {
            const g = roomMap[rk] || []
            return (
              <div key={rk} style={{ borderRadius: 11, padding: 13, border: `1px solid ${g.length ? 'var(--in3)' : 'var(--ln)'}`, background: g.length ? 'oklch(0.2 0.02 152 / 0.28)' : 'oklch(0.175 0.006 255)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{rk}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: g.length ? 'oklch(0.8 0.12 152)' : 'var(--txl)' }}>{g.length ? `${g.length} người` : 'trống'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {g.map((gu, gi) => {
                    const hrs = Number(gu.hours_in_room ?? 0)
                    const entryTime = gu.entry_ts ? fmtTime(gu.entry_ts) : '—'
                    return (
                      <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar gender={gu.gender} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gu.display_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                            <div style={{ flex: 1, maxWidth: 120, height: 5, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, (hrs / 12) * 100)}%`, background: durColor(hrs) }} />
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tmd)' }}>{durText(hrs)}</span>
                            <span style={{ fontSize: 10, color: 'var(--txl)' }}>vào {entryTime}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
