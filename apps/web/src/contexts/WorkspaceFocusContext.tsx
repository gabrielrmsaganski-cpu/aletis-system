import { createContext, useContext } from 'react'

export const WorkspaceFocusContext = createContext({
  focused: false,
  setFocused: (_focused: boolean): void => {},
})

export function useWorkspaceFocus() {
  return useContext(WorkspaceFocusContext)
}
