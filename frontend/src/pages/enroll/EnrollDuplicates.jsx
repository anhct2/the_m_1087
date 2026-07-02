import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Btn, Loading, Empty, Icon } from '../../components/UI'
import { getDuplicates, dismissCluster } from '../../api/client'
import { snapUrl, fmtShortDate } from '../../utils'
import { SubHeader, ConfBadge } from './EnrollShell'

export default function EnrollDuplicates() {
  const navigate = useNavigate()
  const [clusters, setClusters] = useState([])
  const [loading, setLoading]   = useState(true)

  function load() {
    setLoading(true)
    getDuplicates().then(r => setClusters(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function handleDismiss(cluster) {
    const memberIds = cluster.members.slice(1).map(m => m.id)
    dismissCluster(cluster.cluster_id, { member_ids: memberIds })
      .then(() => setClusters(cs => cs.filter(c => c.cluster_id !== cluster.cluster_id)))
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SubHeader title="Trùng lặp" sub="Các hồ sơ nghi trùng (cosine ≥ 0.82) · nhấp ảnh để mở hồ sơ, xem lịch sử" right={
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tlo)' }}>{clusters.length} cụm</span>
      } />

      {loading ? (
        <Loading />
      ) : !clusters.length ? (
        <Empty message="Không phát hiện hồ sơ trùng lặp" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {clusters.map(cluster => (
            <div key={cluster.cluster_id} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 13, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--am)' }}>{Math.round(cluster.max_similarity * 100)}%</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tlo)' }}>tương đồng · {cluster.members.length} hồ sơ</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {cluster.members.map((m, i) => {
                  return (
                    <div key={m.id} onClick={() => navigate(`/enroll/profiles/${m.id}`)} title="Mở hồ sơ" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--ln)', cursor: 'pointer', background: 'var(--bg2)' }}>
                      <Avatar gender={m.gender} size={42} src={snapUrl(m.face_event_id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.display_name || 'Chưa đặt tên'}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--tlo)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          <span>{m.known_room || '—'}</span>
                          <span style={{ fontFamily: 'var(--mono)' }}>×{m.enroll_count} lần</span>
                          {m.last_seen_ts && <span style={{ fontFamily: 'var(--mono)' }}>{fmtShortDate(m.last_seen_ts)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <ConfBadge level={m.confidence_lvl} />
                        {i > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>{Math.round(m.similarity * 100)}%</span>}
                      </div>
                      <Icon name="chevron" size={14} style={{ color: 'var(--tlo)' }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" style={{ flex: 1, fontSize: 11.5 }} onClick={() => handleDismiss(cluster)}>Không phải trùng</Btn>
                <Btn variant="primary" style={{ flex: 1, fontSize: 11.5 }} onClick={() => navigate(`/enroll/merge/${cluster.cluster_id}`)}>Xem / Gộp</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
