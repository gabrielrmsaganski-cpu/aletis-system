import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // ── Tema ──
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // ── Cliente selecionado (global) ──
  selectedClienteId: string | null
  setSelectedClienteId: (id: string | null) => void

  // ── Empresa financeira selecionada ──
  selectedEmpresaId: string
  setSelectedEmpresaId: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      selectedClienteId: null,
      setSelectedClienteId: (id) => set({ selectedClienteId: id }),
      selectedEmpresaId: '',
      setSelectedEmpresaId: (id) => set({ selectedEmpresaId: id }),
    }),
    {
      name: 'aletis-app-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        selectedEmpresaId: state.selectedEmpresaId,
      }),
    }
  )
)
