function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StatusCard({
  title,
  quantidade = 0,
  valorTotal = 0,
  color = '#FFFFFF',
  bgColor = '#1F1F1F',
  onClick,
  active = false
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      style={{
        backgroundColor: bgColor,
        cursor: 'pointer',
        padding: '20px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
        outline: 'none'
      }}
      className={[
        'rounded-xl select-none',
        'hover:scale-105',
        active ? 'ring-2 ring-white shadow-xl' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.boxShadow = `0 8px 30px ${bgColor}55`
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.boxShadow = 'none'
        }
      }}
    >
      {/* Título */}
      <p
        className="text-sm font-bold uppercase tracking-wide mb-3 truncate"
        style={{ color: 'rgba(255,255,255,0.9)' }}
      >
        {title}
      </p>

      {/* Quantidade */}
      <p className="text-4xl font-black text-white leading-none mb-1">
        {quantidade}
      </p>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
        proposta{quantidade !== 1 ? 's' : ''}
      </p>

      {/* Separador */}
      <div
        className="w-full mb-3"
        style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }}
      />

      {/* Valor total */}
      <p className="text-sm font-semibold text-white">
        {formatCurrency(valorTotal)}
      </p>
    </div>
  )
}
