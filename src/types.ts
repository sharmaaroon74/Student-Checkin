export type SchoolName = 'Bain' | 'QG' | 'MHE' | 'MC'
export type Status = 'not_picked' | 'picked' | 'arrived' | 'checked' | 'skipped'

export type StudentRow = {
  id: string
  first_name: string
  last_name: string
  room_id: number | null
  school: SchoolName
  approved_pickups: string[]
  no_bus_days: string[]
  active: boolean
}
