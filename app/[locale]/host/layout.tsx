export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide header and footer on /host page via CSS */}
      <style>{`
        header, footer, nav { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; }
        #main-content { flex-grow: 1; }
      `}</style>
      {children}
    </>
  );
}
