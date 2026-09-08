export default function OfflinePage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      <img src="/wenna_logo01.png" alt="WennaShop" style={{ height: 72, width: 'auto', marginBottom: 40 }} />
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Vous êtes hors connexion</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.6, marginBottom: 28 }}>
        Pas d'inquiétude — ton panier est sauvegardé. Dès que la connexion revient, tout se resynchronise automatiquement.
      </p>
      <a href="/boutique" style={{ background: 'var(--accent)', color: '#fff', padding: '13px 28px', borderRadius: 999, fontWeight: 700, textDecoration: 'none' }}>Réessayer</a>
    </div>
  );
}
