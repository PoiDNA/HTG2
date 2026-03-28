export default function HostV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        header, footer, nav { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; }
        #main-content { flex-grow: 1; }
      `}</style>
      {children}
    </>
  );
}
