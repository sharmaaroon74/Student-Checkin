// src/types.ts

// Single source of truth for shared types across app

export type Status = 'not_picked' | 'picked' | 'arrived' | 'checked' | 'skipped'

// Allow any school string in DB; UI can still filter to Bain/QG/MHE/MC
export type SchoolName = string

export type StudentRow = {
  id: string
  first_name: string
  last_name: string
  approved_pickups: string[]
  school: SchoolName
  active: boolean
  room_id?: number | null
  school_year?: string | null
}
