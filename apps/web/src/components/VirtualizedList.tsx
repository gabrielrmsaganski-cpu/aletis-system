// ============================================================
// VirtualizedList — wrapper inteligente sobre react-window v2
// ============================================================
// Virtualiza listas grandes (>= threshold) sem disturbar o
// comportamento normal para listas pequenas. Suporta altura
// fixa por item; container responde ao tamanho do parent.
//
// Para listas < threshold renderiza inline (zero overhead).
// Para listas >= threshold cria FixedSizeList do react-window.
//
// Comportamento UX preservado: scroll smooth, foco no row,
// estado expandido individual continua funcionando porque
// a row mantém sua identidade pelo `key` fornecido.
// ============================================================
import { type ReactElement, useMemo } from 'react'
import { List, type RowComponentProps } from 'react-window'

interface VirtualizedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactElement
  itemKey: (item: T, index: number) => string | number
  /** Altura por item em px. Default 96 (compatível com LeadRow padrão). */
  itemSize?: number
  /** Altura total da janela virtualizada. Default 720. */
  height?: number
  /** Threshold para ativar virtualização. Default 50. */
  threshold?: number
  /** Classe aplicada ao container quando NÃO virtualizado. */
  className?: string
  /** Linhas extras renderizadas fora da viewport (smooth scroll). */
  overscan?: number
}

export default function VirtualizedList<T>({
  items,
  renderItem,
  itemKey,
  itemSize = 96,
  height = 720,
  threshold = 50,
  className = '',
  overscan = 4,
}: VirtualizedListProps<T>) {
  // Memoizar rowProps evita re-mount dos rows entre renders
  const rowProps = useMemo(() => ({ items, renderItem, itemKey }), [items, renderItem, itemKey])

  if (items.length < threshold) {
    return (
      <div className={className}>
        {items.map((item, i) => (
          <div key={itemKey(item, i)}>{renderItem(item, i)}</div>
        ))}
      </div>
    )
  }

  return (
    <List
      defaultHeight={height}
      rowCount={items.length}
      rowHeight={itemSize}
      overscanCount={overscan}
      rowComponent={VirtualRow<T>}
      rowProps={rowProps}
    />
  )
}

function VirtualRow<T>({
  index,
  style,
  items,
  renderItem,
  itemKey,
}: RowComponentProps<{
  items: T[]
  renderItem: (item: T, index: number) => ReactElement
  itemKey: (item: T, index: number) => string | number
}>) {
  const item = items[index]
  if (item == null) return null
  return (
    <div style={style} key={itemKey(item, index)}>
      {renderItem(item, index)}
    </div>
  )
}
