// HTG Meeting layout — NO header, NO footer, full viewport
export default function SpotkanieLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] bg-[#0a0e1a]">{children}</div>;
}
