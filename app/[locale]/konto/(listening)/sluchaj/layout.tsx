export default function ListeningLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-htg-bg flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
