export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // Inline fallback keeps admin readable if CSS chunks fail during a bad dev/build state.
  return (
    <div
      className="min-h-screen bg-black text-white antialiased"
      style={{ backgroundColor: "#000000", color: "#fafafa", minHeight: "100vh" }}
    >
      {children}
    </div>
  );
}
