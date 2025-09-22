import React from 'react'
import type { Status } from '../types'

const STATUS_LABEL: Record<Status, string> = {
  not_picked: 'To Pick',
  picked: 'Picked',
  arrived: 'Arrived',
  checked: 'Checked Out',
  skipped: 'Skipped',
}

type Props = {
  schoolSel: 'All' | 'Bain' | 'QG' | 'MHE' | 'MC'
  onSchoolSel: (v: 'All' | 'Bain' | 'QG' | 'MHE' | 'MC') => void
  search: string
  onSearch: (v: string) => void
  sortBy: 'first' | 'last'
  onSortBy: (v: 'first' | 'last') => void
  counts: Record<Status, number>
}

export default function TopToolbar({
  schoolSel, onSchoolSel, search, onSearch, sortBy, onSortBy, counts
}: Props) {
  return (
    <div className="toolbar-bg">
      <div className="row gap wrap toolbar">
        {/* School filter (segmented) */}
        <div className="seg seg-scroll">
          {(['All','Bain','QG','MHE','MC'] as const).map(k => (
            <button
              key={k}
              className={`seg-btn ${schoolSel === k ? 'on' : ''}`}
              onClick={() => onSchoolSel(k)}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          className="search"
          placeholder="Search student…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />

        {/* Sort */}
        <div className="row gap" style={{ marginLeft: 'auto' }}>
          <label className="muted">Sort</label>
          <select value={sortBy} onChange={e => onSortBy(e.target.value as 'first' | 'last')}>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>
        </div>
      </div>

      {/* Global counts (respect page filters) */}
      <div className="counts row wrap gap">
        {(Object.keys(counts) as Status[]).map(st => (
          <span key={st} className="chip">
            {STATUS_LABEL[st]} <b>{counts[st]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}
