export default function LiveGameLayout({ children }: { children: React.ReactNode }) {
  /** Cancel root shell padding so the map stage can be edge-to-edge vertically and horizontally. */
  return <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">{children}</div>;
}
