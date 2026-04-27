import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'ALETIS — Finanças Estratégicas & Agrobusiness'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph image gerada dinamicamente em runtime edge.
 * Usa a paleta oficial: verde-dark #17251b + cream #ede9d9 + gold #cb9d52.
 * Sem dependência de imagem externa — toda a composição é via JSX/CSS.
 */
export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'linear-gradient(135deg, #080d09 0%, #17251b 50%, #243a2c 100%)',
          padding: '80px',
          position: 'relative',
        }}
      >
        {/* Glow gold no canto superior */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            right: '-100px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(203,157,82,0.32) 0%, transparent 65%)',
          }}
        />
        {/* Watermark do bracket-A enorme */}
        <svg
          width="520"
          height="520"
          viewBox="0 0 64 64"
          style={{
            position: 'absolute',
            right: '-80px',
            bottom: '-100px',
            opacity: 0.06,
          }}
        >
          <rect x="6" y="6" width="52" height="52" rx="2" fill="none" stroke="#ede9d9" strokeWidth="2.4" />
          <path d="M19 50 L32 16 L45 50 Z" fill="none" stroke="#ede9d9" strokeWidth="2.4" />
          <rect x="24" y="36" width="16" height="3.6" fill="#ede9d9" />
        </svg>

        {/* Logo + ALETIS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <svg width="84" height="84" viewBox="0 0 64 64">
            <rect x="6" y="6" width="52" height="52" rx="2" fill="none" stroke="#ede9d9" strokeWidth="4" />
            <path d="M19 50 L32 16 L45 50 Z" fill="none" stroke="#ede9d9" strokeWidth="4" />
            <rect x="24" y="36" width="16" height="3.6" fill="#ede9d9" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: '56px',
                fontWeight: 800,
                color: '#ede9d9',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              ALETIS
            </div>
            <div
              style={{
                fontSize: '16px',
                color: '#cb9d52',
                letterSpacing: '0.18em',
                marginTop: '12px',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Finanças Estratégicas &amp; Agrobusiness
            </div>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            maxWidth: '840px',
          }}
        >
          <div
            style={{
              fontSize: '78px',
              fontWeight: 700,
              color: '#ede9d9',
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}
          >
            A mesa que reorganiza
          </div>
          <div
            style={{
              fontSize: '78px',
              fontWeight: 700,
              color: '#cb9d52',
              fontStyle: 'italic',
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}
          >
            a dívida do agro.
          </div>
          <div
            style={{
              fontSize: '22px',
              color: 'rgba(237,233,217,0.72)',
              marginTop: '24px',
              lineHeight: 1.5,
              maxWidth: '720px',
            }}
          >
            Diagnóstico financeiro auditável · Reestruturação multi-credor ·
            Inteligência de mercado para o produtor brasileiro.
          </div>
        </div>

        {/* Footer pilares */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            marginTop: '36px',
            borderTop: '1px solid rgba(178,189,161,0.2)',
            paddingTop: '20px',
          }}
        >
          {['AGRO', 'CORPORATE', 'FOMENTO', 'GESTÃO'].map((p) => (
            <div
              key={p}
              style={{
                fontSize: '14px',
                color: '#b2bda1',
                letterSpacing: '0.18em',
                fontWeight: 600,
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
